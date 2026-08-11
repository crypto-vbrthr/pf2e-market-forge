# PF2E Market Forge

PF2E Market Forge is a Foundry VTT module for Pathfinder 2e that aims to turn buying and selling equipment into a rules-aware market workflow for characters and the Party stash.

## Milestone 2

Milestone 2 makes the **Buy** tab a real, read-only equipment browser.

### Available now

- Open Market Forge from a character inventory.
- Open Market Forge from the Party inventory.
- Open Market Forge from the Actor Directory context menu.
- Browse physical items from the market profile's configured compendia.
- Default source: `pf2e.equipment-srd`.
- Search by item name.
- Filter by item type, level, rarity, and compendium.
- Apply the current market level cap to catalog entries.
- Calculate party-derived caps from character members of the Party actor.
- Display unavailable items as disabled, or hide them when the profile requests it.
- Expand an item inline to lazy-load and render its PF2e description.
- Open the complete original PF2e item sheet from the preview.
- Cached compendium indices keep repeated searches lightweight.

### Still intentionally inactive

- Adding catalog entries to the cart.
- Selling inventory items.
- Checkout and currency/item mutations.
- Scroll and wand browser UI.

Those operations remain behind the transaction boundary established in Milestone 0.

## Default market profile

The initial profile uses:

- Items: `pf2e.equipment-srd`
- Spells: `pf2e.spells-srd`
- Maximum level: average party level, rounded down
- Rarity: common enabled; uncommon, rare, and unique displayed as unavailable
- Buy multiplier: 100%
- Sell multiplier: 50%

A dedicated profile/source configuration UI is planned after the core shopping workflow is working end to end.

## Development

Run the contract tests with:

```bash
npm test
```

The test suite does not require a running Foundry instance.
