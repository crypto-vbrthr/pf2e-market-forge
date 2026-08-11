# PF2E Market Forge

PF2E Market Forge is a Foundry VTT module for Pathfinder 2e that turns buying and selling equipment into a rules-aware market workflow for characters and the Party stash.

## Milestone 5

Milestone 5 completes the first real **buy and sell** loop.

### Available now

- Open Market Forge from a character inventory.
- Open Market Forge from the Party inventory.
- Open Market Forge from the Actor Directory context menu.
- Browse physical items from configured PF2e Item compendia.
- Search and filter by item type, level, rarity, and compendium.
- Apply fixed or party-derived market level limits.
- Expand item rows to lazy-load the rendered PF2e description.
- Add multiple items and quantities to a purchase cart.
- Merge identical purchase cart products and recalculate totals.
- Run purchase checkout as a dry run or complete a real purchase.
- Browse the selected character or Party inventory in the Sell tab.
- Expand sellable inventory rows to inspect their PF2e descriptions before selling.
- Add concrete inventory items and partial quantities to a separate sale cart.
- Calculate standard sale proceeds at 50% through the central pricing service.
- Apply full-value sale treatment to configured art objects, gems, and materials.
- Block currency, temporary/infused, unidentified, equipped, invested, contained, subitem-bearing, quantity-less, and valueless entries from sale.
- Re-resolve live inventory items and quantities immediately before sale checkout.
- Remove sold quantities first, then credit PF2e currency only after every item mutation succeeds.
- Restore removed items/quantities if a later sale mutation or currency credit fails.
- Compensate an unexpected partial currency credit if the PF2e write reports failure afterward.
- Re-resolve catalog entries from a fresh compendium index immediately before purchase checkout.
- Ignore all client/cart price claims and recompute authoritative purchase and sale totals.
- Recheck actor permissions, current inventory quantities, and live currency immediately before mutation.
- Use PF2e inventory/currency operations through adapter boundaries rather than writing economic state from the UI.
- Keep the relevant cart intact after failed checkout and clear it only after success.
- Prevent duplicate checkout from the same Market Forge client and protect same-actor execution with a shared local transaction lock.
- Write private purchase or sale receipts to the requesting user and GMs. Receipt failure never rolls back an otherwise successful transaction.

### Transaction model

Foundry does not provide a multi-document database transaction for this workflow. Market Forge therefore uses **compensating transactions**.

For purchases it revalidates the request, removes currency, applies all inventory additions, then reverses successful item mutations and refunds the payment if a later inventory write fails.

For sales it revalidates each live owned item and quantity, removes all sold items/quantities first, credits the proceeds only after the item phase succeeds, and restores item mutations if the credit phase fails. A `rollback-failed` result is treated as a critical state and surfaced prominently for GM review.

### Still intentionally inactive

- Choosing a different character/Party actor as payment source, purchase recipient, sale source, or proceeds recipient.
- Scroll and wand browser/generation UI.
- Real merchant actors and finite merchant stock.
- Market profile/source configuration UI.
- Cross-client GM-authoritative socket serialization. M5 still uses a module-wide lock inside one Foundry client; later hardening will route player checkout through an authoritative coordinator before shared Party transactions are considered release-grade.

## Default market profile

The initial profile uses:

- Items: `pf2e.equipment-srd`
- Spells: `pf2e.spells-srd`
- Maximum level: average party level, rounded down
- Rarity: common enabled; uncommon, rare, and unique displayed as unavailable
- Buy multiplier: 100%
- Sell multiplier: 50%
- Full-value treasure sale categories: art objects, gems, and materials

A dedicated profile/source configuration UI is planned after the core market workflow is working end to end.

## Development

Run the contract tests with:

```bash
npm test
```

The test suite does not require a running Foundry instance.
