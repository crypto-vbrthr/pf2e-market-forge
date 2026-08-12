# Market Forge v0.1 Contract

## Hard invariants

1. Persistent contract data contains UUIDs and primitives, never live Foundry Documents.
2. Monetary values are non-negative integer copper pieces (`CopperValue`).
3. Cart contents are drafts only and never mutate Foundry state.
4. Checkout never trusts cart/client prices. Price fields are stripped from the normalized request.
5. Real player checkout is executed by the current GM authority, not by the requesting player client.
6. The authoritative GM reloads the current `MarketProfile`, current actor data, and current product data before mutation.
7. Authoritative purchase preparation uses a fresh catalog index, current market availability, and a newly computed `PriceQuote`.
8. Authoritative sale preparation re-resolves the concrete owned item, current quantity, sellability, and a newly computed `PriceQuote`.
9. PF2e document writes are isolated behind `CurrencyAdapter`, `InventoryAdapter`, and `SpellItemAdapter`.
10. A stale `TransactionPlan` cannot be executed directly; real checkout accepts a `CheckoutRequest` and prepares a new plan under authoritative coordination.
11. Transactions are coordinated by every actor they touch. Any two transactions sharing either their inventory actor or currency actor are serialized across clients.
12. Live actor balance is validated before purchase mutation, and PF2e currency removal performs a second live sufficiency check during mutation.
13. Live owned-item quantity is validated before sale mutation and again by the inventory adapter at write time.
14. Successful inventory writes return compensation records sufficient to undo newly-created purchase stacks, restore prior stack quantities, restore partially sold quantities, or recreate fully sold items.
15. A failed purchase compensates successful inventory writes in reverse order and refunds removed currency.
16. A sale removes all requested inventory quantities before proceeds are credited. If a later item removal or currency credit fails, prior item mutations are restored in reverse order; unexpected partial currency credit is compensated.
17. Receipt creation is non-economic: a receipt failure is a warning and never reverses a successful transaction.
18. A successful checkout clears only the relevant cart direction; failed or rolled-back checkout preserves it.
19. A real checkout carries a client-generated `operationId`. Repeating the same requester + operation ID + intent returns the same in-flight/completed operation; the same ID with changed intent is rejected.
20. Scroll ranks range from their spell's base rank through rank 10.
21. Standard wand ranks range from their spell's base rank through rank 9.
22. Runtime spell snapshots and carts are not persistent.
23. Catalog indices contain lightweight metadata only; item descriptions are resolved lazily on expansion.
24. Catalog visibility and checkout availability share the same `AvailabilityService` contract.
25. A configured but unavailable compendium degrades to a source warning instead of breaking the market window.
26. Physical items without a positive declared market/stack price are not purchasable or sellable automatically.
27. PF2e `price.per` is preserved as a grouped-price contract. The line's declared stack value is resolved before applying a market multiplier.
28. Market multipliers are applied to the complete line value; final copper is rounded once per line.
29. Fixed monetary spell costs are added to generated scroll prices. Ambiguous, variable, or non-monetary spell costs block automatic scroll generation rather than being guessed.
30. A missing required PF2e write capability or rank-specific spell-item base template blocks the operation before economic mutation.

## Core contracts

### MarketProfile

Stores source packs, level-limit strategy, rarity access, pricing factors, and spell-item enablement.

### CatalogEntry

Lightweight buy-list metadata. Full rendered descriptions belong to `ItemPreviewService` and are loaded lazily. Price metadata retains `stackPrice` and `pricePer` so grouped PF2e prices are not flattened prematurely.

### SaleInventoryEntry

Lightweight metadata for a concrete owned physical item. It retains the embedded item UUID, live quantity, grouped price metadata, treasure category, and explicit sellability reasons. It is re-resolved at checkout and is not client authority.

### SpellItemDraft

Represents a concrete scroll or standard wand generated from a spell plus selected cast rank. It remains a draft until checkout. A scroll may also carry a conservatively parsed fixed monetary spell cost.

### CartLine

Contains direction, quantity, concrete product identity, and quoted display prices. Quoted prices are never authoritative. Sell lines identify the exact embedded inventory item UUID rather than merely its source item. The cart retains enough quote metadata to recompute grouped-price line totals when quantity changes.

### CheckoutRequest

Contains direction, requested products, quantities, item actor, currency actor, market profile, and optional operation ID. A real client request intentionally contains no trusted price and does not provide authoritative user identity. The transport/authority supplies the requester for validation.

### TransactionPlan

Created only after requested products are re-resolved and current availability, quantities, and prices are recomputed. It is an internal execution artifact, not client authority.

### TransactionResult

Purchase and sale execution return one of:

- `completed`: all requested economic mutations committed;
- `failed`: validation or the first economic write failed before a compensating rollback was needed;
- `rolled-back`: an execution error occurred and compensation restored the known economic state;
- `rollback-failed`: at least one compensating operation failed and GM review is required.

## GM-authoritative transport boundary

Real checkout from a player is sent through Foundry V14's targeted `User#query` API to `game.users.activeGM`. The GM-side `AuthoritativeMarketService` owns the fresh profile/product resolution, permission validation, actor capability checks, cross-client coordination, and real `TransactionService.checkout()` call.

The query transport is a targeted coordination boundary, not a cryptographic identity primitive for module payload fields. Market Forge therefore still validates the referenced active user record and actual actor permissions and never trusts client-supplied prices or market state. Checkout responses sent over the query contain only compact status data; detailed mutation snapshots remain on the authority client.

Profile-change broadcasts continue to use the package socket so already-open player windows can refresh after a GM saves profiles. Economic checkout request/response traffic does not use the raw package socket.

## PF2e adapter boundary

`CurrencyAdapter` uses PF2e's actor inventory currency API. Copper values are converted to PF2e denominations only at the adapter edge.

For purchases, `InventoryAdapter` resolves the current source document at write time and passes the source to PF2e inventory addition with stacking enabled. Before the write it records enough information to restore a prior stack or remove a newly created one.

For sales, `InventoryAdapter` resolves the concrete embedded item again. A partial sale updates only its live quantity; a full sale deletes the embedded item while retaining its complete source snapshot and identifier for compensation.

`SpellItemAdapter` starts from PF2e's configured rank-specific base scroll/wand template and embeds a fresh spell source. If the required PF2e base template is absent, Market Forge marks that spell-item/rank unavailable before adapter mutation.

The transaction service does not call Foundry embedded-document mutation methods directly.

## Sale protection boundary

The following are intentionally non-sellable in the Market Forge UI and authoritative checkout path:

- currency entries;
- temporary or infused physical items;
- unidentified items;
- equipped **non-treasure** items;
- invested items;
- items currently inside a container;
- items carrying subitems;
- items without a positive quantity;
- items without a positive declared stack value.

Treasure is not blocked merely because PF2e reports it as carried/equipped; this preserves sale of gems, art objects, and materials.

## Spell-item rules boundary

Spell compendia are indexed separately from physical equipment. Only ordinary ranked spells are eligible for generated spell items; cantrips, focus spells, and rituals are excluded.

A spell-item cart product stores only user intent (`kind`, `spellUuid`, `spellRank`, quantity, display metadata). During authoritative checkout Market Forge re-resolves the current spell, rechecks the active market, rebuilds the draft, verifies the PF2e rank template, and generates a fresh item source.

Ordinary scrolls support ranks 1–10. Ordinary wands support ranks 1–9. Rank selection may never be below the source spell's base rank.

For scrolls, a fixed, unambiguous monetary `Spell.cost` is added to the base scroll table price. If the cost is variable or cannot be safely represented as a fixed coin value, automatic scroll generation is unavailable. Ordinary wand table pricing is not modified by this parser.
