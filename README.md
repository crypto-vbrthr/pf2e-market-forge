# PF2E Market Forge

PF2E Market Forge is a Foundry VTT module for Pathfinder 2e that turns buying and selling equipment into a rules-aware market workflow for characters and the Party stash.

## Milestone 6.2

Milestone 6 adds the first complete **spell-item purchase workflow** on top of the existing real buy/sell loop.

### Available now

- Everything from Milestone 5, including real purchase/sale checkout, rollback, receipts, and the treasure-sale hotfix.
- Browse approved PF2e spell compendia in the Spell Items tab.
- Search and filter spells by name, base rank, tradition, rarity, and compendium.
- Cantrips, focus spells, and rituals are excluded from ordinary scroll/wand generation.
- Select a spell and configure it as a scroll or ordinary wand.
- Select any supported cast rank from the spell's base rank upward.
- Rank 10 spells can be configured as scrolls; ordinary wands remain limited to rank 9.
- Derive item level and price from the selected spell-item type and cast rank.
- Preview the spell at the selected heightened rank before adding it to the cart.
- Open the original PF2e spell sheet from the configurator or cart preview.
- Keep different spell ranks and item types as distinct cart products while merging identical configurations.
- Rebuild the generated scroll/wand from current PF2e spell data immediately before checkout.
- Insert generated spell items through the same stack-aware inventory adapter used by ordinary purchases.
- Roll back generated item mutations and refund currency if a later purchase step fails.

### Still intentionally inactive

- Choosing a different character/Party actor as payment source, purchase recipient, sale source, or proceeds recipient.
- Real merchant actors and finite merchant stock.
- Market profile/source configuration UI.
- Cross-client GM-authoritative socket serialization. M6 still uses a module-wide lock inside one Foundry client; later hardening will route player checkout through an authoritative coordinator before shared Party transactions are considered release-grade.

## Default market profile

The initial profile uses:

- Items: `pf2e.equipment-srd`
- Spells: `pf2e.spells-srd`
- Maximum level: configurable by the GM; default is average party level, rounded down
- Rarity: common enabled; uncommon, rare, and unique displayed as unavailable
- Buy multiplier: 100%
- Sell multiplier: 50%
- Full-value treasure sale categories: art objects, gems, and materials

The level-limit controls are now exposed as world settings. A dedicated profile/source configuration UI for compendia, rarities, pricing, and named markets remains planned.

## Development

Run the contract tests with:

```bash
npm test
```

The test suite does not require a running Foundry instance.


## Market level settings

Milestone 6.1 adds GM-controlled world settings under **Configure Settings → Module Settings → PF2E Market Forge**. The maximum purchasable item level can be fixed, based on the party average/highest/lowest character level, or unlimited. Party-derived modes support a configurable integer offset and floor/normal/ceil rounding. The Market Forge header shows the currently resolved calculation for the actor/party that opened the market.

## Milestone 6.2

A GM world setting now controls the maximum number of entries displayed in the equipment and spell-item catalog lists. The default is 150 and the supported setting range is 25–500. Filtering and searching still run against the full catalog before the visible result list is truncated.
