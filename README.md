# PF2E Market Forge

PF2E Market Forge is a Foundry VTT module for Pathfinder 2e that turns buying and selling equipment into a rules-aware market workflow for characters and the Party stash.

## Milestone 7

Milestone 7 turns the single global market into persistent **named market profiles**.

### Available now

- Everything from Milestone 6.2, including real buy/sell checkout, rollback, receipts, scroll/wand generation, configurable market level, and catalog result limits.
- GM-only **Market Profiles & Compendia** configuration submenu under Foundry module settings.
- Create, duplicate, rename, save, delete, and choose a default market profile.
- Select the active market profile directly in the Market Forge header.
- Choose equipment compendia independently from spell compendia for each market.
- Configure each market's item-level rule, fixed level, party offset, rounding, rarity access, unavailable-item display, buy/sell multipliers, full-value treasure handling, and scroll/wand availability.
- Search and filtering operate only on the compendia configured for the currently active market.
- Existing M6.x level settings are migrated into the initial default profile on first M7 load.
- Switching profiles clears both carts so stale prices and availability cannot bleed from one market into another.

### Still intentionally inactive

- Choosing a different character/Party actor as payment source, purchase recipient, sale source, or proceeds recipient.
- Real merchant actors and finite merchant stock.
- Cross-client GM-authoritative socket serialization. M7 still uses a module-wide lock inside one Foundry client; later hardening will route player checkout through an authoritative coordinator before shared Party transactions are considered release-grade.

## Market profiles

Open **Configure Settings → Module Settings → PF2E Market Forge → Manage Market Profiles** as GM. Each profile can define:

- Market name and default status
- Equipment and spell compendium sources
- Maximum item level: fixed, party average/highest/lowest, or unlimited
- Party-level offset and rounding
- Allowed rarities
- Whether unavailable entries are hidden or shown disabled
- Purchase and sale multipliers
- Full-value sale handling for art objects, gems, and materials
- Scroll and ordinary wand availability

The global **maximum list entries** option remains a normal world setting because it controls UI result size rather than market economics.

## Development

Run the contract tests with:

```bash
npm test
```

The test suite does not require a running Foundry instance.


## Global UI setting

The GM world setting **Maximum entries per market list** controls the visible result cap for equipment and spell catalogs. The default is 150 and the supported range is 25–500. Searching and filtering still operate on the complete configured catalog before results are truncated. Market economics and level rules now live inside each named profile instead of separate global controls.
