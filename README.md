# PF2E Market Forge

PF2E Market Forge is a Foundry VTT module for Pathfinder 2e that turns buying and selling equipment into a rules-aware market workflow for characters and the Party stash.

## Milestone 4

Milestone 4 completes the first real **purchase** path.

### Available now

- Open Market Forge from a character inventory.
- Open Market Forge from the Party inventory.
- Open Market Forge from the Actor Directory context menu.
- Browse physical items from configured PF2e Item compendia.
- Search and filter by item type, level, rarity, and compendium.
- Apply fixed or party-derived market level limits.
- Expand item rows to lazy-load the rendered PF2e description.
- Add multiple items and quantities to a purchase cart.
- Merge identical cart products and recalculate totals.
- Run a checkout dry run without changing documents.
- Complete a real purchase.
- Re-resolve catalog entries from a fresh compendium index immediately before checkout.
- Ignore all client/cart price claims and recompute the authoritative total.
- Recheck actor permissions and live currency immediately before mutation.
- Deduct PF2e currency through `ActorInventory.removeCurrency(..., { byValue: true })`.
- Add physical items through `ActorInventory.add(..., { stack: true })`, so PF2e decides whether to create or stack.
- Record exact inventory mutation compensation data for rollback.
- Refund the purchase value and restore already-applied item mutations if a later item write fails.
- Keep the cart intact after failed checkout; clear it only after success.
- Prevent duplicate checkout from the same Market Forge client and protect same-actor execution with a shared local transaction lock.
- Write a private purchase receipt to the requesting user and GMs. Receipt failure never rolls back an otherwise successful purchase.

### Transaction model

Foundry does not provide a multi-document database transaction for this workflow. Market Forge therefore uses a **compensating transaction**:

1. normalize the checkout request and discard supplied prices;
2. acquire the actor transaction lock;
3. reload/reindex requested products and recompute availability and prices;
4. validate permissions and live funds;
5. remove currency using PF2e's currency API;
6. add/stack each item using PF2e's inventory API;
7. if an item write fails, undo successful item mutations in reverse order and refund the purchase value;
8. create the chat receipt only after economic state is complete.

A `rollback-failed` result is treated as a critical state and is surfaced prominently to the user.

### Still intentionally inactive

- Selling inventory items.
- Choosing a different character/Party actor as payment source or recipient.
- Scroll and wand browser/generation UI.
- Real merchant actors and finite merchant stock.
- Cross-client GM-authoritative socket serialization. M4 has a module-wide lock inside one Foundry client; later hardening will route player checkout through an authoritative coordinator before shared Party purchasing is considered final.

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
