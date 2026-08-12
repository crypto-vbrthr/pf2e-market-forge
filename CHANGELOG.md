# Changelog

## 0.0.12 - Milestone 7.1 Hotfix

- Market Forge now listens for profile changes while its window is already open.
- Saving a newly created market profile immediately refreshes the market-profile selector; closing and reopening Market Forge is no longer required.
- Renames and edits of the active profile are reflected immediately.
- Changing the default profile refreshes the selector state immediately.
- Deleting a profile refreshes open Market Forge windows and falls back safely if the active profile was deleted.
- Hook listeners are removed when the Market Forge window closes.
- Added a live-profile-refresh regression test.

## 0.0.11 - Milestone 7

- Added persistent named market profiles stored as world configuration.
- Added a GM-only **Market Profiles & Compendia** configuration submenu.
- Added per-profile equipment and spell compendium source selection.
- Added per-profile maximum item-level mode, fixed level, party offset, rounding, rarity access, unavailable-entry display, buy/sell multipliers, full-value treasure rules, and scroll/wand availability.
- Added a market-profile selector directly to the Market Forge header.
- Added a GM shortcut from the Market Forge window to the profile manager.
- Added a configurable default market profile.
- Migrates the existing M6.x global market-level settings into the initial default profile on first M7 load.
- Existing M6.x level settings remain registered but hidden for migration compatibility; their controls now live in the profile editor.
- Switching markets clears both carts to prevent stale prices or availability from crossing profile boundaries.
- Added persistent profile, compendium discovery, settings-menu, and profile-template regression tests.

## 0.0.10 - Milestone 6.2

- Added a GM world setting for the maximum number of entries shown in market catalog lists.
- The setting applies to both equipment and spell-item catalog results.
- Search and filters continue to operate on the complete indexed catalog before the display limit is applied.
- Default remains 150 entries; configurable from 25 to 500.
- Added registration and normalization regression tests.

## 0.0.9 - Milestone 6.1

- Added GM world settings for market item-level calculation mode.
- Added fixed item-level mode, party average/highest/lowest modes, and unlimited mode.
- Added configurable party-level offset and floor/normal/ceil rounding.
- The default market profile now reads these settings when Market Forge opens and on subsequent renders.
- Added a live calculation summary to the Market Forge header.
- Catalog, scroll/wand configuration, cart validation, and checkout all continue to use the same resolved maximum item level.

## 0.0.8 - Milestone 6

- Added a spell catalog backed by configured PF2e spell compendia.
- Excluded cantrips, focus spells, and rituals from scroll/wand generation.
- Added spell search and filters for base rank, tradition, rarity, and compendium.
- Added scroll and ordinary wand configuration with selectable cast rank.
- Added rules-derived spell-item levels and prices for every supported rank.
- Added heightened spell previews using PF2e spell variants and roll data.
- Added generated scroll/wand cart products, including separate lines per spell, type, and rank.
- Added PF2e spell-item source generation using the system's current base-item templates and embedded-spell data shape.
- Added authoritative checkout regeneration of the selected spell item immediately before purchase.
- Added generated-source insertion through the same stack-aware inventory/rollback path as ordinary purchases.
- Rank 10 spells are limited to scrolls because ordinary rank 10 wands are not supported.
- Added M6 catalog, preview, adapter, generated-source transaction, view-state, and template contract tests.

## 0.0.7 - Milestone 5 Hotfix

- Fixed treasure items such as gems being blocked from sale when PF2e reports them as carried/equipped.
- The equipped-state sale protection now applies only to non-treasure physical items.
- Added a regression test for carried/equipped treasure sale eligibility.

## 0.0.6 - Milestone 5

- Added real sale checkout for character and Party inventories.
- Added sell-inventory mapping with lazy item previews and partial-quantity selection.
- Added separate sale-cart state, quantity editing, removal, totals, dry-run validation, and checkout execution.
- Added standard 50% sale pricing and configured full-value handling for art objects, gems, and materials.
- Added sale protections for currency, temporary/infused, unidentified, equipped, invested, contained, subitem-bearing, quantity-less, and valueless items.
- Added authoritative live re-resolution of inventory items, quantities, sellability, and prices before checkout.
- Added partial stack reduction and full embedded-item deletion with exact compensation records.
- Added compensating sale rollback, including restoration of removed items/quantities and compensation of unexpected partial currency credit.
- Added private sale receipts and non-economic receipt failure behavior.
- Added M5 sale inventory, adapter mutation, pricing, cart, transaction, rollback, receipt, and template contract tests.

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
