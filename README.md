# PF2E Market Forge

Milestone 0 establishes the module shell and the contracts for the future market implementation.

## Current scope

Implemented and contract-tested:

- canonical copper-value money representation
- market profile validation/defaults
- fixed and party-derived item-level limits
- availability decisions for level, rarity, and compendium source
- purchase/sale price quotes and full-value treasure handling
- runtime-only buy/sell carts
- scroll and standard wand rank/level/price derivation
- checkout request normalization that ignores client-provided prices
- PF2e adapter interfaces that deliberately perform no document writes yet
- public API and launcher scaffold

Not implemented in Milestone 0:

- market UI
- actor-sheet / actor-directory launch buttons
- compendium indexing
- item previews
- real currency or inventory mutations
- GM-authoritative sockets
- receipts

## Foundry target

- Foundry VTT v14
- Pathfinder 2e system required

## Running tests

```bash
npm test
```

Milestone 0 uses Node's built-in test runner, so no test dependency installation is required.

The runtime code avoids importing Foundry globals in the domain services, so the contracts can be tested in plain Node.

## Architecture rule

The cart is a draft, not authority. Checkout requests never provide authoritative prices. Final availability and pricing will be recomputed by the transaction layer before any Foundry document mutation is allowed.
