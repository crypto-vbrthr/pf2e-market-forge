# PF2E Market Forge v0.1 Contract

This document defines the contracts Market Forge intends to keep stable through the v0.1 release line. Implementation details may move, but the invariants below must not silently change.

## Hard invariants

1. Persistent contract data contains UUIDs and primitives, never live Foundry Documents.
2. Monetary values are non-negative integer copper pieces (`CopperValue`).
3. Cart contents are drafts only and never mutate Foundry state.
4. Checkout never trusts cart/client prices. Price fields are stripped from normalized checkout intent.
5. Real player checkout is executed by the designated active GM authority, not by the requesting player client.
6. Requester identity used for permission checks is not accepted from the checkout body. Player checkout uses a short-lived GM-issued session capability delivered back to that specific Foundry User through a targeted User query.
7. The authoritative GM reloads the current `MarketProfile`, actor data, and product data before mutation.
8. Purchase preparation uses a fresh catalog resolution, current market availability, and a newly computed `PriceQuote`.
9. Sale preparation re-resolves the concrete owned item, current quantity, sellability, and a newly computed `PriceQuote`.
10. The same `MarketProductResolver` rules are used by local dry-run preparation and authoritative GM checkout so spell/item resolution cannot drift between UI and authority paths.
11. PF2e document writes are isolated behind `CurrencyAdapter`, `InventoryAdapter`, and `SpellItemAdapter`.
12. A stale `TransactionPlan` cannot be executed directly; real checkout accepts a `CheckoutRequest` and prepares a new plan under authoritative coordination.
13. Transactions are coordinated by every actor they touch. Transactions sharing either inventory actor or currency actor are serialized across clients.
14. Live balance is validated before purchase mutation, and PF2e currency removal performs a second live sufficiency check during mutation.
15. Live owned-item quantity is validated before sale mutation and again by the inventory adapter at write time.
16. Successful inventory writes return compensation records sufficient to undo newly-created purchase stacks, restore prior stack quantities, restore partially sold quantities, or recreate fully sold items.
17. A failed purchase compensates successful inventory writes in reverse order and refunds removed currency.
18. A sale removes all requested inventory quantities before proceeds are credited. If a later mutation fails, prior inventory changes are restored in reverse order and partial currency changes are compensated where possible.
19. Receipt creation is non-economic: receipt failure is a warning and never reverses a successful transaction.
20. A successful checkout clears only the relevant cart direction; failed or rolled-back checkout preserves it.
21. A real checkout carries a client-generated `operationId`. Repeating the same requester + operation ID + intent returns the same in-flight/completed operation; the same ID with changed intent is rejected.
22. Scroll ranks range from their spell's base rank through rank 10. Standard wand ranks range from the spell's base rank through rank 9.
23. Runtime spell snapshots, checkout sessions, transaction plans, and carts are not persistent.
24. Catalog indices contain lightweight metadata only; item descriptions are resolved lazily on expansion.
25. Catalog visibility and checkout availability share the same `AvailabilityService` contract.
26. A configured but unavailable compendium degrades to a source warning instead of breaking the market window.
27. Physical items without a positive declared market/stack price are not purchasable or sellable automatically.
28. PF2e `price.per` is preserved as grouped-price data. The declared stack value is resolved before applying a market multiplier.
29. Market multipliers are applied to the complete line value; final copper is rounded once per line.
30. Fixed monetary spell costs are added to generated scroll prices. Ambiguous, variable, or non-monetary spell costs block automatic scroll generation rather than being guessed.
31. Missing required PF2e write capabilities or a rank-specific scroll/wand base template block the operation before economic mutation.
32. Revalidation and complete transactions are hard invariants, not configurable profile switches. Mixed payment sources are not part of the v0.1 profile contract.

## MarketProfile

A `MarketProfile` stores only market behavior that is actually implemented:

- `schemaVersion`, `id`, `name`
- `sources.itemCompendia`
- `sources.spellCompendia`
- `availability.levelLimit`
- `availability.rarities`
- `availability.unavailableDisplay`
- `pricing.buyMultiplier`
- `pricing.sellMultiplier`
- `pricing.fullValueTreasure`
- `spellItems.scrolls`
- `spellItems.wands`

Legacy M0-M7 `transaction` switches are ignored and removed when stored profiles are normalized. They never controlled checkout safety.

## CatalogEntry and SaleInventoryEntry

`CatalogEntry` is lightweight buy-list metadata. Full rendered descriptions belong to preview services and are loaded lazily. Price metadata retains stack price and `price.per` information so PF2e grouped prices are not flattened prematurely.

`SaleInventoryEntry` identifies one concrete owned physical item by embedded UUID. It retains live quantity, grouped price metadata, treasure category, and explicit sellability reasons. It is re-resolved at checkout and is never client authority.

## SpellItemDraft

A `SpellItemDraft` represents one generated scroll or standard wand from a concrete spell and selected cast rank. It remains a draft until checkout. Scroll drafts may carry a conservatively parsed fixed monetary spell cost.

Generated items embed a fresh spell source at the selected heightened rank. The current spell is re-resolved during authoritative checkout rather than trusting a stale spell snapshot from the cart.

## CartLine

A cart line contains direction, quantity, concrete product intent, and quoted display prices. Quoted prices are never authoritative.

Sell lines identify the exact embedded inventory item UUID. Spell-item lines identify `kind`, `spellUuid`, and `spellRank`. The cart retains enough grouped-price quote metadata to update display totals when quantity changes.

## CheckoutRequest

The client checkout body contains:

- `direction`
- `profileId`
- `itemActorUuid`
- `currencyActorUuid`
- optional `operationId`
- `lines[]` containing product intent and quantity

It does **not** provide authoritative requester identity or authoritative prices.

`normalizeCheckoutIntent()` normalizes pure client intent. `normalizeCheckoutRequest()` may attach a requester only when that identity is supplied separately by the local/authority layer.

## TransactionPlan and TransactionResult

A `TransactionPlan` is created only after products, availability, quantities, permissions, and prices are re-resolved. It is an internal execution artifact.

Execution returns one of:

- `completed`: all requested economic mutations committed;
- `failed`: validation or the first economic write failed before compensation was needed;
- `rolled-back`: an execution error occurred and compensation restored the known economic state;
- `rollback-failed`: at least one compensating operation failed and GM review is required.

## GM-authoritative transport boundary

Player checkout uses Foundry's targeted User-query mechanism to communicate with the designated active GM. The public query callback does not form the requester-identity contract by itself, so Market Forge adds a session-binding step:

1. The player asks the active GM to provision a session for its current User id.
2. The GM generates a short-lived random capability token.
3. The GM sends that token in a separate targeted query to the claimed User document itself. The token is not returned in the original provisioning response.
4. The player includes the token, not a requester id, in subsequent checkout queries.
5. The GM maps the token back to the User id and performs permission validation using that identity.
6. Expired/invalid sessions are reprovisioned and checkout is retried once with the same operation id.

This is a Foundry-session coordination boundary, not a promise of protection against arbitrary code already executing with the same user's client privileges.

Raw `module.pf2e-market-forge` socket traffic is non-economic and currently used for profile-change broadcasts only.

## PF2e adapter boundary

`CurrencyAdapter` uses PF2e actor inventory currency APIs. Copper values are converted to PF2e denominations only at the adapter edge.

For purchases, `InventoryAdapter` resolves the current source document at write time and uses PF2e inventory addition with stacking enabled. Before writing it records enough information to restore an old stack or remove a newly-created one.

For sales, `InventoryAdapter` re-resolves the concrete embedded item. A partial sale updates only live quantity; a full sale deletes the embedded item while retaining a source snapshot sufficient for compensation.

`SpellItemAdapter` starts from PF2e's configured rank-specific base scroll/wand template and embeds a fresh spell source. Missing base templates make the generated product unavailable before mutation.

The transaction service does not directly call embedded-document mutation methods.

## Sale protection boundary

The following are intentionally non-sellable:

- currency entries;
- temporary or infused physical items;
- unidentified items;
- equipped non-treasure items;
- invested items;
- items inside a container;
- items carrying subitems;
- items without a positive quantity;
- items without a positive declared stack value.

Treasure is not blocked merely because PF2e reports it as carried/equipped. This preserves sale of gems, art objects, and materials.

## Public API v1

The module exposes a deliberately small API as `game.modules.get("pf2e-market-forge").api`:

- `version`
- `open(options)`
- `getProfiles()`
- `getProfile(id)`
- `getDefaultProfile()`
- `diagnose({ actorUuid? })`

Transaction execution, transaction plans, adapters, and quote engines are not public API in v0.1.

`diagnose()` returns JSON-safe primitive data about module/system versions, profiles, PF2e capability checks, optional actor write capability, and current transport/authority status. It does not return live Foundry Documents.


## City Forge provider contract (0.2.0)

City Forge is an optional availability provider. Market Forge never persists a copy of the settlement economy context.

A profile can store:

```js
availability: {
  provider: {
    type: "manual" | "city-forge",
    sourceId: "settlement-id::market-id"
  }
}
```

When `type === "city-forge"`:

- manual `levelLimit` and `rarities` are not used for buy availability;
- `sources.itemCompendia` and `sources.spellCompendia` remain mandatory Market Forge gates;
- `unavailableDisplay` remains a Market Forge presentation rule;
- `pricing.buyMultiplier` is multiplied by the City Forge evaluation's `priceMultiplier`;
- sell availability and sell pricing remain Market Forge-owned.

The provider must fail closed if it cannot obtain the configured City Forge context.

### Catalog / checkout parity

The same provider result semantics must be used in:

- physical catalog search
- direct product lookup before adding to cart
- spell catalog / spell-item generation
- local dry-run validation
- authoritative GM checkout re-resolution

A provider integration that only filters the visible catalog violates this contract.

### Authority boundary

The client checkout request carries the MarketProfile id and product identity only.

The authority GM reloads the MarketProfile and current City Forge context. It must not accept a client-provided `SettlementEconomyContext`, provider evaluation, availability result, or price multiplier as authoritative input.
