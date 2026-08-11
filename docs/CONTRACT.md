# Market Forge v0.1 Contract

## Hard invariants

1. Persistent contract data contains UUIDs and primitives, never live Foundry Documents.
2. Monetary values are non-negative integer copper pieces (`CopperValue`).
3. Cart contents are drafts only and never mutate Foundry state.
4. Checkout never trusts cart/client prices. Price fields are stripped from the normalized request.
5. Authoritative purchase preparation uses a fresh catalog index, current market availability, and a newly computed `PriceQuote`.
6. Authoritative sale preparation re-resolves the concrete owned item, current quantity, sellability, and a newly computed `PriceQuote`.
7. PF2e document writes are isolated behind `CurrencyAdapter` and `InventoryAdapter`.
8. A stale `TransactionPlan` cannot be executed directly; real checkout accepts a `CheckoutRequest` and prepares a new plan under the transaction lock.
9. Live actor balance is validated before purchase mutation, and PF2e currency removal performs a second live sufficiency check during mutation.
10. Live owned-item quantity is validated before sale mutation and again by the inventory adapter at write time.
11. Successful inventory writes return compensation records sufficient to undo newly-created purchase stacks, restore prior stack quantities, restore partially sold quantities, or recreate fully sold items.
12. A failed purchase compensates successful inventory writes in reverse order and refunds removed currency.
13. A sale removes all requested inventory quantities before proceeds are credited. If a later item removal or currency credit fails, prior item mutations are restored in reverse order; unexpected partial currency credit is compensated.
14. Receipt creation is non-economic: a receipt failure is a warning and never reverses a successful transaction.
15. A successful checkout clears only the relevant cart direction; failed or rolled-back checkout preserves it.
16. Scroll ranks range from their spell's base rank through rank 10.
17. Standard wand ranks range from their spell's base rank through rank 9.
18. Runtime spell snapshots and carts are not persistent.
19. Catalog indices contain lightweight metadata only; item descriptions are resolved lazily on expansion.
20. Catalog visibility and checkout availability share the same `AvailabilityService` contract.
21. A configured but unavailable compendium degrades to a source warning instead of breaking the market window.

## Core contracts

### MarketProfile

Stores source packs, level-limit strategy, rarity access, pricing factors, spell-item enablement, and transaction preferences.

### CatalogEntry

Lightweight buy-list metadata. Full rendered descriptions belong to `ItemPreviewService` and are loaded lazily.

### SaleInventoryEntry

Lightweight metadata for a concrete owned physical item. It retains the embedded item UUID, live quantity, base value, treasure category, and explicit sellability reasons. It is re-resolved at checkout and is not client authority.

### SpellItemDraft

Represents a concrete scroll or standard wand generated from a spell plus selected cast rank. It remains a draft until checkout.

### CartLine

Contains direction, quantity, concrete product identity, and quoted display prices. Quoted prices are never authoritative. Sell lines identify the exact embedded inventory item UUID rather than merely its source item.

### CheckoutRequest

Contains direction, requested products, quantities, item actor, currency actor, market profile, and requesting user. It intentionally contains no trusted price.

### TransactionPlan

Created only after requested products are re-resolved and current availability, quantities, and prices are recomputed. It is an internal execution artifact, not client authority.

### TransactionResult

Purchase and sale execution return one of:

- `completed`: all requested economic mutations committed;
- `failed`: validation or the first economic write failed before a compensating rollback was needed;
- `rolled-back`: an execution error occurred and compensation restored the known economic state;
- `rollback-failed`: at least one compensating operation failed and GM review is required.

## Milestone 5 adapter boundary

`CurrencyAdapter` uses PF2e's actor inventory currency API. Copper values are converted to PF2e denominations only at the adapter edge.

For purchases, `InventoryAdapter` resolves the current source document at write time and passes the source to PF2e inventory addition with stacking enabled. Before the write it records enough information to restore a prior stack or remove a newly created one.

For sales, `InventoryAdapter` resolves the concrete embedded item again. A partial sale updates only its live quantity; a full sale deletes the embedded item while retaining its complete source snapshot and identifier for compensation.

The transaction service does not call Foundry embedded-document mutation methods directly.

## Sale protection boundary

Milestone 5 intentionally treats the following as non-sellable in the Market Forge UI and authoritative checkout path:

- currency entries;
- temporary or infused physical items;
- unidentified items;
- equipped items;
- invested items;
- items currently inside a container;
- items carrying subitems;
- items without a positive quantity;
- items without a positive sale value.

These protections prevent the initial sale implementation from silently breaking PF2e equipment state or nested inventory relationships. They can be revisited later as explicit opt-in rules rather than bypassed implicitly.

## Concurrency boundary

Milestone 5 includes a module-wide in-client actor lock and Application-level checkout busy state. This prevents double-clicks and overlapping Market Forge transactions involving the same actor within one Foundry client. Cross-client authoritative serialization remains a later hardening task and must be completed before shared Party checkout is considered release-grade.
