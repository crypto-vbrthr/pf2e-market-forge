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
10. Runtime spell snapshots and carts are not persistent.
11. Milestone 2 catalog indices contain lightweight metadata only; item descriptions are resolved lazily on expansion.
12. Catalog visibility and checkout availability share the same `AvailabilityService` contract.
13. A configured but unavailable compendium must degrade to a source warning instead of breaking the market window.

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


## Milestone 2 catalog boundary

`CatalogService` reads only configured item compendia and returns lightweight `CatalogEntry` data plus availability state. It does not create, update, or delete Foundry documents.

`ItemPreviewService` resolves a full item only after the user expands a row, enriches the current description, caches that preview for the session, and may open the original item sheet. Preview loading is read-only.

The default development profile seeds `pf2e.equipment-srd` and `pf2e.spells-srd` as initial source identifiers. Dedicated source/profile configuration remains a later milestone.
