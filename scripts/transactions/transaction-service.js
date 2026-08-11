import { InventoryAdapter } from "../pf2e/inventory-adapter.js";
import { CurrencyAdapter } from "../pf2e/currency-adapter.js";
import { PriceService } from "../pricing/price-service.js";
import { ReceiptService } from "../receipts/receipt-service.js";
import { normalizeCheckoutRequest } from "./checkout-contract.js";
import { globalTransactionLock, transactionLockKey } from "./transaction-lock.js";
import { validateTransactionPlan } from "./transaction-validator.js";

export class TransactionService {
  #profileProvider;
  #productResolver;
  #priceService;
  #balanceProvider;
  #currencyAdapter;
  #inventoryAdapter;
  #receiptService;
  #permissionProvider;
  #lock;
  #idFactory;
  #now;

  constructor({
    profileProvider,
    productResolver,
    priceService = new PriceService(),
    balanceProvider,
    currencyAdapter = new CurrencyAdapter(),
    inventoryAdapter = new InventoryAdapter(),
    receiptService = new ReceiptService(),
    permissionProvider,
    lock = globalTransactionLock,
    idFactory = () => crypto.randomUUID(),
    now = () => Date.now()
  } = {}) {
    this.#profileProvider = profileProvider ?? (async () => null);
    this.#productResolver = productResolver ?? (async () => null);
    this.#priceService = priceService;
    this.#currencyAdapter = currencyAdapter;
    this.#inventoryAdapter = inventoryAdapter;
    this.#receiptService = receiptService;
    this.#balanceProvider = balanceProvider ?? ((actorUuid) => this.#currencyAdapter.getBalance(actorUuid));
    this.#permissionProvider = permissionProvider ?? (async () => true);
    this.#lock = lock;
    this.#idFactory = idFactory;
    this.#now = now;
  }

  async prepare(request, { maximumItemLevel = null, authoritative = false } = {}) {
    const normalized = normalizeCheckoutRequest(request);
    const profile = await this.#profileProvider(normalized.profileId);
    if (!profile) throw new RangeError(`Market profile not found: ${normalized.profileId}`);

    const lines = [];
    let total = 0;

    for (const requestedLine of normalized.lines) {
      const resolved = await this.#productResolver(requestedLine.product, {
        profile,
        maximumItemLevel,
        authoritative,
        direction: normalized.direction,
        itemActorUuid: normalized.itemActorUuid,
        currencyActorUuid: normalized.currencyActorUuid
      });
      const identity = requestedLine.product.inventoryItemUuid ?? requestedLine.product.sourceUuid ?? "unknown";
      if (!resolved) throw new RangeError(`Market product not found: ${identity}`);

      const price = normalized.direction === "buy"
        ? this.#priceService.quotePurchase(resolved, requestedLine.quantity, profile)
        : this.#priceService.quoteSale(resolved, requestedLine.quantity, profile);
      total += price.totalPrice;

      const availability = structuredClone(resolved.availability ?? { available: true, reasons: [] });
      if (normalized.direction === "sell") {
        const availableQuantity = Number(resolved.availableQuantity ?? resolved.quantity ?? 0);
        if (!Number.isSafeInteger(availableQuantity) || requestedLine.quantity > availableQuantity) {
          availability.available = false;
          availability.reasons = [...new Set([...(availability.reasons ?? []), "insufficient-quantity"])]
        }
      }

      lines.push({
        product: structuredClone(requestedLine.product),
        resolvedProduct: {
          uuid: resolved.uuid ?? identity ?? null,
          name: resolved.name ?? requestedLine.product.name ?? "",
          level: resolved.level ?? null,
          availableQuantity: resolved.availableQuantity ?? resolved.quantity ?? null
        },
        quantity: requestedLine.quantity,
        price,
        availability
      });
    }

    return {
      transactionId: this.#idFactory(),
      direction: normalized.direction,
      profileId: normalized.profileId,
      itemActorUuid: normalized.itemActorUuid,
      currencyActorUuid: normalized.currencyActorUuid,
      requestedByUserId: normalized.requestedByUserId,
      lines,
      total,
      validatedAt: this.#now()
    };
  }

  async validate(plan) {
    const availableBalance = await this.#safeBalance(plan.currencyActorUuid);
    const validation = validateTransactionPlan(plan, { availableBalance });

    if (validation.valid) {
      const permission = await this.#permissionProvider({
        userId: plan.requestedByUserId,
        itemActorUuid: plan.itemActorUuid,
        currencyActorUuid: plan.currencyActorUuid,
        direction: plan.direction
      });
      if (!permission) {
        validation.valid = false;
        validation.errors = [...new Set([...validation.errors, "permission-denied"])]
      }
    }

    return validation;
  }

  async dryRun(request, options = {}) {
    const plan = await this.prepare(request, { ...options, authoritative: true });
    const validation = await this.validate(plan);
    return { plan, validation };
  }

  /**
   * Execute a new purchase or sale request. The request is freshly resolved and priced while holding
   * the local actor transaction lock; a stale dry-run plan is never accepted as checkout input.
   */
  async checkout(request, options = {}) {
    const normalized = normalizeCheckoutRequest(request);
    const key = transactionLockKey(normalized);

    try {
      return await this.#lock.run(key, async () => {
        const plan = await this.prepare(normalized, { ...options, authoritative: true });
        const validation = await this.validate(plan);
        if (!validation.valid) {
          return {
            transactionId: plan.transactionId,
            status: "failed",
            direction: plan.direction,
            total: plan.total,
            remainingBalance: validation.remainingBalance ?? null,
            lines: [],
            errors: [...validation.errors],
            warnings: [...validation.warnings]
          };
        }

        return this.#executeValidated(plan);
      });
    } catch (error) {
      const code = error?.code === "transaction-locked" ? "transaction-locked" : "transaction-error";
      return {
        transactionId: null,
        status: "failed",
        direction: normalized.direction,
        total: 0,
        remainingBalance: null,
        lines: [],
        errors: [code],
        warnings: [],
        cause: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Kept for the public contract, but deliberately refuses arbitrary plans. Call checkout(request).
   */
  async execute() {
    throw new Error("PF2E Market Forge: execute(plan) is disabled; use checkout(request) so prices and availability are revalidated.");
  }

  async #executeValidated(plan) {
    return plan.direction === "sell"
      ? this.#executeSaleValidated(plan)
      : this.#executePurchaseValidated(plan);
  }

  async #executePurchaseValidated(plan) {
    const mutations = [];
    let currencyRemoved = false;

    try {
      const removed = await this.#currencyAdapter.remove(plan.currencyActorUuid, plan.total);
      if (!removed) {
        return {
          transactionId: plan.transactionId,
          status: "failed",
          direction: plan.direction,
          total: plan.total,
          remainingBalance: await this.#safeBalance(plan.currencyActorUuid),
          lines: [],
          errors: ["insufficient-funds"],
          warnings: []
        };
      }
      currencyRemoved = true;

      for (const line of plan.lines) {
        const sourceUuid = line.resolvedProduct?.uuid;
        if (!sourceUuid) throw new Error("Resolved purchase line has no source UUID.");
        const mutation = await this.#inventoryAdapter.addFromUuid(plan.itemActorUuid, sourceUuid, line.quantity);
        mutations.push(mutation);
      }

      const remainingBalance = await this.#safeBalance(plan.currencyActorUuid);
      const warnings = [];
      try {
        await this.#receiptService?.createPurchaseReceipt?.({ plan, remainingBalance });
      } catch (error) {
        console.warn?.("pf2e-market-forge | Purchase completed but receipt creation failed", error);
        warnings.push("receipt-failed");
      }

      await this.#safeRefresh(plan.itemActorUuid);
      return {
        transactionId: plan.transactionId,
        status: "completed",
        direction: plan.direction,
        total: plan.total,
        remainingBalance,
        lines: plan.lines.map((line, index) => ({
          product: structuredClone(line.product),
          resolvedProduct: structuredClone(line.resolvedProduct),
          quantity: line.quantity,
          price: structuredClone(line.price),
          mutation: structuredClone(mutations[index])
        })),
        errors: [],
        warnings
      };
    } catch (error) {
      const rollbackErrors = [];

      for (const mutation of [...mutations].reverse()) {
        await this.#attemptRollbackMutation(mutation, rollbackErrors);
      }

      if (currencyRemoved) {
        try {
          await this.#currencyAdapter.add(plan.currencyActorUuid, plan.total);
        } catch (rollbackError) {
          rollbackErrors.push(messageOf(rollbackError));
        }
      }

      await this.#safeRefresh(plan.itemActorUuid);
      return rollbackResult(plan, error, rollbackErrors, await this.#safeBalance(plan.currencyActorUuid));
    }
  }

  async #executeSaleValidated(plan) {
    const mutations = [];
    const startingBalance = await this.#safeBalance(plan.currencyActorUuid);

    try {
      for (const line of plan.lines) {
        const itemUuid = line.resolvedProduct?.uuid ?? line.product?.inventoryItemUuid;
        if (!itemUuid) throw new Error("Resolved sale line has no inventory item UUID.");
        const mutation = await this.#inventoryAdapter.removeOwnedItem(plan.itemActorUuid, itemUuid, line.quantity);
        mutations.push(mutation);
      }

      // PF2e normally applies addCurrency as a grouped actor update. If an implementation throws
      // after a partial mutation, the outer compensation path compares against startingBalance.
      await this.#currencyAdapter.add(plan.currencyActorUuid, plan.total);

      const remainingBalance = await this.#safeBalance(plan.currencyActorUuid);
      const warnings = [];
      try {
        await this.#receiptService?.createSaleReceipt?.({ plan, remainingBalance });
      } catch (error) {
        console.warn?.("pf2e-market-forge | Sale completed but receipt creation failed", error);
        warnings.push("receipt-failed");
      }

      await this.#safeRefresh(plan.itemActorUuid);
      return {
        transactionId: plan.transactionId,
        status: "completed",
        direction: plan.direction,
        total: plan.total,
        remainingBalance,
        lines: plan.lines.map((line, index) => ({
          product: structuredClone(line.product),
          resolvedProduct: structuredClone(line.resolvedProduct),
          quantity: line.quantity,
          price: structuredClone(line.price),
          mutation: structuredClone(mutations[index])
        })),
        errors: [],
        warnings
      };
    } catch (error) {
      const rollbackErrors = [];
      await this.#compensateUnexpectedCredit(plan.currencyActorUuid, startingBalance, rollbackErrors);

      for (const mutation of [...mutations].reverse()) {
        await this.#attemptRollbackMutation(mutation, rollbackErrors);
      }

      await this.#safeRefresh(plan.itemActorUuid);
      return rollbackResult(plan, error, rollbackErrors, await this.#safeBalance(plan.currencyActorUuid));
    }
  }

  async #attemptRollbackMutation(mutation, rollbackErrors) {
    try {
      await this.#inventoryAdapter.rollbackMutation(mutation);
    } catch (rollbackError) {
      rollbackErrors.push(messageOf(rollbackError));
    }
  }

  async #compensateUnexpectedCredit(actorUuid, startingBalance, rollbackErrors) {
    if (!Number.isSafeInteger(startingBalance) || startingBalance < 0) return;
    const current = await this.#safeBalance(actorUuid);
    if (!Number.isSafeInteger(current) || current <= startingBalance) return;
    const excess = current - startingBalance;
    try {
      const removed = await this.#currencyAdapter.remove(actorUuid, excess);
      if (!removed) rollbackErrors.push(`Could not remove unexpected credited currency (${excess} cp).`);
    } catch (rollbackError) {
      rollbackErrors.push(messageOf(rollbackError));
    }
  }

  async #safeRefresh(actorUuid) {
    try {
      await this.#inventoryAdapter.refresh?.(actorUuid);
    } catch (_error) {
      // Rendering never changes transaction outcome.
    }
  }

  async #safeBalance(actorUuid) {
    try {
      return await this.#balanceProvider(actorUuid);
    } catch (_error) {
      return null;
    }
  }
}

function rollbackResult(plan, error, rollbackErrors, remainingBalance) {
  const errorCode = typeof error?.code === "string" ? error.code : "transaction-error";
  return {
    transactionId: plan.transactionId,
    status: rollbackErrors.length ? "rollback-failed" : "rolled-back",
    direction: plan.direction,
    total: plan.total,
    remainingBalance,
    lines: [],
    errors: [errorCode],
    warnings: rollbackErrors.length ? ["rollback-incomplete"] : [],
    cause: messageOf(error),
    rollbackErrors
  };
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}
