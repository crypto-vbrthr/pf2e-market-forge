# Changelog

## 0.0.3 - Milestone 2

- Added a real PF2e equipment catalog backed by configured Item compendia.
- Default market profile now uses `pf2e.equipment-srd` and `pf2e.spells-srd` as its initial sources.
- Added cached compendium indexing with lightweight physical-item metadata.
- Added catalog search and filters for item type, level, rarity, and compendium.
- Added market-level availability checks to the catalog, including disabled/hidden behavior from the MarketProfile contract.
- Added party-aware market maximum resolution using character members of the reference Party actor.
- Added lazy expandable item previews: full documents and descriptions are loaded only when a row is opened.
- Added a button to open the original PF2e item sheet from an expanded preview.
- Added result caps and source diagnostics to keep large compendia responsive.
- Added M2 catalog, preview, level-context, filter-state, and template contract tests.
- Buying, selling, cart mutation, spell-item generation UI, and currency mutation remain intentionally disabled.

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

## 0.0.4 - Milestone 3

- Activated the purchase cart for regular catalog items.
- Added per-catalog quantity selection and automatic merging of identical cart lines.
- Added cart quantity editing, line removal, clearing, and live total calculation.
- Connected displayed purchase prices to the central `PriceService`.
- Added read-only PF2e currency balance access through `CurrencyAdapter`.
- Added recipient/payment-source summary for the actor that opened Market Forge.
- Implemented authoritative purchase-plan preparation and checkout dry-run validation.
- Checkout now reloads products from the configured market sources and recalculates prices instead of trusting cart quotes.
- Added insufficient-funds validation and dry-run result reporting.
- Kept all inventory and currency mutations disabled until Milestone 4.
