# Market Forge v0.1 Contract

## Hard invariants

1. Persistent contract data contains UUIDs and primitives, never live Foundry Documents.
2. Monetary values are non-negative integer copper pieces (`CopperValue`).
3. Cart contents are drafts only and never mutate Foundry state.
4. Checkout is authoritative only after server/GM-side revalidation.
5. Client-provided price fields are ignored by checkout normalization.
6. PF2e document writes are isolated behind adapters.
7. A transaction plan must use recomputed availability and price quotes.
8. Scroll ranks range from their spell's base rank through rank 10.
9. Standard wand ranks range from their spell's base rank through rank 9.
10. Runtime spell snapshots and carts are not persistent in Milestone 0.

## Core contracts

### MarketProfile

Stores source packs, level-limit strategy, rarity access, pricing factors, spell-item enablement, and transaction preferences.

### CatalogEntry

Lightweight list metadata only. Full rendered descriptions belong to `ItemPreviewService` and are loaded lazily later.

### SpellItemDraft

Represents a concrete scroll or standard wand generated from a spell plus selected cast rank. It is still a draft until checkout.

### CartLine

Contains quantity and quoted display prices. Quoted prices are never authoritative.

### CheckoutRequest

Contains requested products, quantities, item actor, currency actor, market profile, and requesting user. It intentionally contains no trusted price.

### TransactionPlan

Future transaction code will create this only after reloading current documents and recomputing availability and prices.
