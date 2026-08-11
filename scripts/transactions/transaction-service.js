import { PriceService } from "../pricing/price-service.js";
import { normalizeCheckoutRequest } from "./checkout-contract.js";
import { validateTransactionPlan } from "./transaction-validator.js";

export class TransactionService {
  #profileProvider;
  #productResolver;
  #priceService;
  #balanceProvider;
  #idFactory;
  #now;

  constructor({
    profileProvider,
    productResolver,
    priceService = new PriceService(),
    balanceProvider,
    idFactory = () => crypto.randomUUID(),
    now = () => Date.now()
  } = {}) {
    this.#profileProvider = profileProvider ?? (async () => null);
    this.#productResolver = productResolver ?? (async () => null);
    this.#priceService = priceService;
    this.#balanceProvider = balanceProvider ?? (async () => 0);
    this.#idFactory = idFactory;
    this.#now = now;
  }

  async prepare(request, { maximumItemLevel = null } = {}) {
    const normalized = normalizeCheckoutRequest(request);
    if (normalized.direction !== "buy") {
      throw new Error("PF2E Market Forge: Milestone 3 prepares purchase transactions only.");
    }

    const profile = await this.#profileProvider(normalized.profileId);
    if (!profile) throw new RangeError(`Market profile not found: ${normalized.profileId}`);

    const lines = [];
    let total = 0;

    for (const requestedLine of normalized.lines) {
      const resolved = await this.#productResolver(requestedLine.product, {
        profile,
        maximumItemLevel
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
    return validateTransactionPlan(plan, { availableBalance });
  }

  async dryRun(request, options = {}) {
    const plan = await this.prepare(request, options);
    const validation = await this.validate(plan);
    return { plan, validation };
  }

  async execute() {
    throw new Error("PF2E Market Forge: transaction execution is intentionally disabled in Milestone 3.");
  }
}
