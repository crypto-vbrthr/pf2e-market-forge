# Market Forge v0.1 Contract

## Hard invariants

1. Persistent contract data contains UUIDs and primitives, never live Foundry Documents.
2. Monetary values are non-negative integer copper pieces (`CopperValue`).
3. Cart contents are drafts only and never mutate Foundry state.
4. Checkout never trusts cart/client prices. Price fields are stripped from the normalized request.
5. Authoritative purchase preparation uses a fresh catalog index, current market availability, and a newly computed `PriceQuote`.
6. PF2e document writes are isolated behind `CurrencyAdapter` and `InventoryAdapter`.
7. A stale `TransactionPlan` cannot be executed directly; real checkout accepts a `CheckoutRequest` and prepares a new plan under the transaction lock.
8. Live actor balance is validated before mutation, and PF2e `removeCurrency` performs a second live sufficiency check during mutation.
9. Successful inventory writes return compensation records sufficient to undo a newly-created stack or restore a previous stack quantity.
10. A failed purchase compensates successful inventory writes in reverse order and refunds removed currency.
11. Receipt creation is non-economic: a receipt failure is a warning and never reverses a successful purchase.
12. A successful purchase clears the cart; failed or rolled-back purchases preserve it.
13. Scroll ranks range from their spell's base rank through rank 10.
14. Standard wand ranks range from their spell's base rank through rank 9.
15. Runtime spell snapshots and carts are not persistent.
16. Catalog indices contain lightweight metadata only; item descriptions are resolved lazily on expansion.
17. Catalog visibility and checkout availability share the same `AvailabilityService` contract.
18. A configured but unavailable compendium degrades to a source warning instead of breaking the market window.

## Core contracts

### MarketProfile

Stores source packs, level-limit strategy, rarity access, pricing factors, spell-item enablement, and transaction preferences.

### CatalogEntry

Lightweight list metadata. Full rendered descriptions belong to `ItemPreviewService` and are loaded lazily.

### SpellItemDraft

Represents a concrete scroll or standard wand generated from a spell plus selected cast rank. It remains a draft until checkout.

### CartLine

Contains quantity and quoted display prices. Quoted prices are never authoritative.

### CheckoutRequest

Contains requested products, quantities, item actor, currency actor, market profile, and requesting user. It intentionally contains no trusted price.

### TransactionPlan

Created only after requested products are re-resolved and current availability and prices are recomputed. It is an internal execution artifact, not client authority.

### TransactionResult

Purchase execution returns one of:

- `completed`: currency and all requested items were committed;
- `failed`: validation/live currency removal failed before economic mutation completed;
- `rolled-back`: an execution error occurred and compensation restored the economic state;
- `rollback-failed`: at least one compensating operation failed and GM review is required.

## Milestone 4 adapter boundary

`CurrencyAdapter` uses PF2e's actor inventory currency API. Copper values are converted to PF2e denominations only at the adapter edge.

`InventoryAdapter` resolves the current source document at write time and passes the source to PF2e `ActorInventory.add` with stacking enabled. Before the write it asks PF2e for the current stack candidate so the adapter can record the prior quantity for compensation.

The transaction service does not call Foundry embedded-document mutation methods directly.

## Concurrency boundary

Milestone 4 includes a module-wide in-client actor lock and Application-level checkout busy state. This prevents double-clicks and overlapping Market Forge purchases within the same Foundry client. Cross-client authoritative serialization remains a later hardening task and must be completed before shared Party checkout is considered release-grade.
