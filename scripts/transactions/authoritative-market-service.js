import { resolveMarketMaximumForActor } from "../market/market-level-context.js";
import { WorldMarketProfileService } from "../market/world-profile-service.js";
import { MarketProductResolver } from "../market/product-resolver.js";
import { CurrencyAdapter } from "../pf2e/currency-adapter.js";
import { InventoryAdapter } from "../pf2e/inventory-adapter.js";
import { PF2eCapabilityService } from "../pf2e/capabilities.js";
import { MarketPermissionService } from "../permissions/permission-service.js";
import { PriceService } from "../pricing/price-service.js";
import { ReceiptService } from "../receipts/receipt-service.js";
import { normalizeCheckoutRequest } from "./checkout-contract.js";
import { globalTransactionCoordinator } from "./transaction-coordinator.js";

import { TransactionService } from "./transaction-service.js";
import { CityForgeProvider, isCityForgeAvailability } from "../integrations/city-forge-provider.js";

export class AuthoritativeMarketService {
  #profileService;
  #currencyAdapter;
  #inventoryAdapter;
  #permissionService;
  #capabilities;
  #coordinator;
  #actorProvider;
  #userProvider;
  #transactionService;
  #productResolver;
  #operations = new Map();
  #operationTtlMs;
  #cityForgeProvider;

  constructor({
    profileService = new WorldMarketProfileService(),
    catalogService = null,
    spellCatalogService = null,
    spellItemService = null,
    spellItemAdapter = null,
    currencyAdapter = new CurrencyAdapter(),
    inventoryAdapter = new InventoryAdapter(),
    saleInventoryService = null,
    permissionService = new MarketPermissionService(),
    capabilityService = new PF2eCapabilityService(),
    coordinator = globalTransactionCoordinator,
    actorProvider = defaultActorProvider,
    userProvider = defaultUserProvider,
    receiptService = new ReceiptService(),
    priceService = new PriceService(),
    transactionService = null,
    productResolver = null,
    cityForgeProvider = new CityForgeProvider(),
    operationTtlMs = 120000
  } = {}) {
    this.#profileService = profileService;
    this.#currencyAdapter = currencyAdapter;
    this.#inventoryAdapter = inventoryAdapter;
    this.#permissionService = permissionService;
    this.#capabilities = capabilityService;
    this.#coordinator = coordinator;
    this.#actorProvider = actorProvider;
    this.#userProvider = userProvider;
    this.#operationTtlMs = Math.max(1000, Number(operationTtlMs) || 120000);
    this.#cityForgeProvider = cityForgeProvider;
    this.#productResolver = productResolver ?? new MarketProductResolver({
      catalogService: catalogService ?? undefined,
      spellCatalogService: spellCatalogService ?? undefined,
      spellItemService: spellItemService ?? undefined,
      spellItemAdapter: spellItemAdapter ?? undefined,
      saleInventoryService,
      inventoryAdapter
    });

    this.#transactionService = transactionService ?? new TransactionService({
      profileProvider: async (profileId) => this.#profileService.getProfile(profileId),
      productResolver: (product, context) => this.#productResolver.resolve(product, context),
      priceService,
      balanceProvider: (actorUuid) => this.#currencyAdapter.getBalance(actorUuid),
      currencyAdapter: this.#currencyAdapter,
      inventoryAdapter: this.#inventoryAdapter,
      receiptService,
      permissionProvider: ({ userId, itemActorUuid, currencyActorUuid, direction }) => (
        direction === "sell"
          ? this.#permissionService.canSell(userId, itemActorUuid, currencyActorUuid)
          : this.#permissionService.canBuy(userId, itemActorUuid, currencyActorUuid)
      )
    });
  }

  async checkout(request, { requesterUserId } = {}) {
    let normalized;
    try {
      normalized = normalizeCheckoutRequest(request, { requestedByUserId: requesterUserId });
    } catch (error) {
      return failedResult(null, request?.direction, "invalid-request", error);
    }

    const requester = this.#userProvider(normalized.requestedByUserId);
    if (!requester || requester.active === false) return failedResult(null, normalized.direction, "requester-unavailable");

    this.#pruneOperations();
    const operationKey = normalized.operationId
      ? `${normalized.requestedByUserId}:${normalized.operationId}`
      : null;
    const fingerprint = operationKey ? operationFingerprint(normalized) : null;
    const cached = operationKey ? this.#operations.get(operationKey) : null;
    if (cached) {
      if (cached.fingerprint !== fingerprint) return failedResult(null, normalized.direction, "operation-id-conflict");
      return cached.promise;
    }

    const actorKeys = [normalized.itemActorUuid, normalized.currencyActorUuid];
    const promise = this.#coordinator.run(actorKeys, async () => {
      const profile = this.#profileService.getProfile(normalized.profileId);
      if (!profile) return failedResult(null, normalized.direction, "market-profile-not-found");

      const itemActor = await this.#actorProvider(normalized.itemActorUuid);
      const currencyActor = normalized.currencyActorUuid === normalized.itemActorUuid
        ? itemActor
        : await this.#actorProvider(normalized.currencyActorUuid);
      if (!itemActor || !currencyActor) return failedResult(null, normalized.direction, "actor-not-found");

      for (const actor of new Set([itemActor, currencyActor])) {
        const capability = this.#capabilities.assertWritableActor(actor);
        if (!capability.compatible) {
          const result = failedResult(null, normalized.direction, "pf2e-incompatible");
          result.cause = capability.missing.join(", ");
          return result;
        }
      }

      const cityForgeSession = await this.#cityForgeProvider.createSession(profile);
      const maximumItemLevel = isCityForgeAvailability(profile)
        ? null
        : resolveMarketMaximumForActor(profile, itemActor, {
            activeParty: globalThis.game?.actors?.party ?? null
          }).result?.maximumItemLevel ?? null;

      return this.#transactionService.checkout(normalized, {
        maximumItemLevel,
        availabilitySession: cityForgeSession,
        requestedByUserId: normalized.requestedByUserId
      });
    });

    if (operationKey) {
      this.#operations.set(operationKey, { fingerprint, promise, expiresAt: Date.now() + this.#operationTtlMs });
    }
    return promise;
  }

  #pruneOperations() {
    const now = Date.now();
    for (const [key, entry] of this.#operations) {
      if (!entry || entry.expiresAt <= now) this.#operations.delete(key);
    }
  }
}

async function defaultActorProvider(uuid) {
  if (!uuid) return null;
  const id = String(uuid).startsWith("Actor.") ? String(uuid).slice(6) : null;
  const actor = id ? globalThis.game?.actors?.get?.(id) : null;
  if (actor) return actor;
  return typeof globalThis.fromUuid === "function" ? globalThis.fromUuid(uuid) : null;
}

function defaultUserProvider(id) {
  return globalThis.game?.users?.get?.(id) ?? null;
}

function failedResult(transactionId, direction = "buy", code = "transaction-error", error = null) {
  return {
    transactionId,
    status: "failed",
    direction: ["buy", "sell"].includes(direction) ? direction : "buy",
    total: 0,
    remainingBalance: null,
    lines: [],
    errors: [code],
    warnings: [],
    ...(error ? { cause: error instanceof Error ? error.message : String(error) } : {})
  };
}

function operationFingerprint(request) {
  return stableStringify({
    direction: request.direction,
    profileId: request.profileId,
    itemActorUuid: request.itemActorUuid,
    currencyActorUuid: request.currencyActorUuid,
    lines: request.lines
  });
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
