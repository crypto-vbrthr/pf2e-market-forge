# Changelog

## 0.0.5 - Milestone 4

- Added real purchase checkout for character and Party actors.
- Added fresh authoritative catalog re-indexing immediately before checkout.
- Added PF2e currency mutation through `ActorInventory.removeCurrency` / `addCurrency`.
- Added PF2e item insertion and stacking through `ActorInventory.add`.
- Added exact compensation records for newly created items and updated stacks.
- Added compensating rollback: item changes are reversed and purchase value refunded after execution failure.
- Added explicit `completed`, `failed`, `rolled-back`, and `rollback-failed` transaction results.
- Added module-wide same-actor transaction locking and Application checkout busy protection.
- Added permission validation for both item target and currency source.
- Added private chat purchase receipts for the buyer and GMs.
- Receipt failure is non-economic and produces a warning without rolling back a completed purchase.
- Cart is cleared only after successful checkout and preserved after failures.
- Added M4 adapter, transaction execution, rollback, locking, fresh-index, receipt, permission, and template contract tests.

## 0.0.4 - Milestone 3

- Added real purchase cart state with quantity-aware lines.
- Added automatic merging of identical products.
- Added cart quantity editing, removal, and clearing.
- Added live purchase quotes and cart totals through the central `PriceService`.
- Added actor currency balance display and affordability checks.
- Added authoritative checkout dry-run preparation and validation.
- Checkout normalization strips client-supplied price claims and recalculates totals from current catalog data.
- Inventories and currency remained intentionally unchanged in M3.

## 0.0.3 - Milestone 2

- Added a real PF2e equipment catalog backed by configured Item compendia.
- Default market profile now uses `pf2e.equipment-srd` and `pf2e.spells-srd` as its initial sources.
- Added cached compendium indexing with lightweight physical-item metadata.
- Added catalog search and filters for item type, level, rarity, and compendium.
- Added market-level availability checks to the catalog, including disabled/hidden behavior from the MarketProfile contract.
- Added party-aware market maximum resolution using character members of the reference Party actor.
- Added lazy expandable item previews and original PF2e item-sheet opening.
- Added result caps and source diagnostics.

## 0.0.2 - Milestone 1

- Added Foundry v14 ApplicationV2 Market Forge shell.
- Added character and party inventory launch buttons.
- Added Actor Directory context-menu launch entry.
- Added automatic actor selection and actor-aware market header.
- Added Buy, Spell Items, Sell, and Cart tabs.
- Added settings for sheet-button and context-menu integrations.
- Added launcher/permission/UI state tests.

## 0.0.1 - Milestone 0

- Initial installable module skeleton.
- v0.1 domain contracts and service boundaries.
- Pure contract tests for money, profiles, availability, pricing, cart, spells, checkout plans, and adapters.
