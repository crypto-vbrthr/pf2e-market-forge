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
    if (normalized.direction !== "buy") {
      throw new Error("PF2E Market Forge: Milestone 4 executes purchase transactions only.");
    }

    const profile = await this.#profileProvider(normalized.profileId);
    if (!profile) throw new RangeError(`Market profile not found: ${normalized.profileId}`);

    const lines = [];
    let total = 0;

    for (const requestedLine of normalized.lines) {
      const resolved = await this.#productResolver(requestedLine.product, {
        profile,
        maximumItemLevel,
        authoritative
      });
      if (!resolved) throw new RangeError(`Market product not found: ${requestedLine.product.sourceUuid ?? "unknown"}`);

      const price = this.#priceService.quotePurchase(resolved, requestedLine.quantity, profile);
      total += price.totalPrice;
      lines.push({
        product: structuredClone(requestedLine.product),
        resolvedProduct: {
          uuid: resolved.uuid ?? requestedLine.product.sourceUuid ?? null,
          name: resolved.name ?? requestedLine.product.name ?? "",
          level: resolved.level ?? null
        },
        quantity: requestedLine.quantity,
        price,
        availability: structuredClone(resolved.availability ?? { available: true, reasons: [] })
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
    const availableBalance = plan?.direction === "buy"
      ? await this.#balanceProvider(plan.currencyActorUuid)
      : null;
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
        validation.errors = [...new Set([...validation.errors, "permission-denied"])];
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
   * Execute a new purchase request. The request is freshly resolved and priced while holding
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
    const mutations = [];
    let currencyRemoved = false;

    try {
      // removeCurrency performs its own live sufficiency check, closing the gap after validation.
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

      await this.#inventoryAdapter.refresh?.(plan.itemActorUuid);
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
        try {
          await this.#inventoryAdapter.rollbackMutation(mutation);
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError instanceof Error ? rollbackError.message : String(rollbackError));
        }
      }

      if (currencyRemoved) {
        try {
          await this.#currencyAdapter.add(plan.currencyActorUuid, plan.total);
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError instanceof Error ? rollbackError.message : String(rollbackError));
        }
      }

      try {
        await this.#inventoryAdapter.refresh?.(plan.itemActorUuid);
      } catch (_refreshError) {
        // Never changes rollback status.
      }

      return {
        transactionId: plan.transactionId,
        status: rollbackErrors.length ? "rollback-failed" : "rolled-back",
        direction: plan.direction,
        total: plan.total,
        remainingBalance: await this.#safeBalance(plan.currencyActorUuid),
        lines: [],
        errors: ["transaction-error"],
        warnings: rollbackErrors.length ? ["rollback-incomplete"] : [],
        cause: error instanceof Error ? error.message : String(error),
        rollbackErrors
      };
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
