# PF2E Market Forge

**Version:** `0.1.0`

PF2E Market Forge is a Foundry VTT module for Pathfinder 2e that turns equipment buying and selling into a rules-aware marketplace workflow for characters and the Party stash.

## v0.1.0 release

The first stable Market Forge release contains the fully tested feature set without changing the economic rules or transaction flow validated during release testing. The v0.1 contracts are now frozen for the release line.

### Contract and transaction hardening

- Player checkout remains GM-authoritative and serialized across every inventory/currency Actor touched by the transaction.
- Checkout requester identity is no longer accepted from the checkout body. Before economic queries, the active GM provisions a short-lived per-user capability token through a separate targeted User query back to that exact Foundry User.
- Expired requester sessions are automatically reprovisioned once while preserving the checkout operation ID.
- Client checkout intent and authoritative requester identity are normalized separately.
- Equipment, sales, scrolls, and wands now use one shared `MarketProductResolver` in both local dry-run and authoritative GM checkout paths.
- The unused legacy profile `transaction` switches are removed from the v0.1 contract. Revalidation and complete transactions are hard invariants; mixed payment sources remain intentionally inactive.
- Added a compact public `diagnose()` API for release/support diagnostics without exposing live Foundry Documents.
- Added German/English localization parity tests and a dedicated `docs/RELEASE_CHECKLIST.md` multiplayer acceptance matrix.

## Existing market features

- Buy and sell physical PF2e equipment.
- Character and Party/team inventory support.
- Separate buy/sell carts with quantity editing and totals.
- Automatic currency deduction/credit and inventory mutation.
- Compensating rollback for failed economic writes.
- Private chat receipts.
- Expandable item and spell descriptions.
- Scroll generation through spell rank 10.
- Standard wand generation through spell rank 9.
- Heightened spell selection and embedded spell source generation.
- Fixed monetary spell extra costs on scrolls; ambiguous costs are blocked rather than guessed.
- Named persistent market profiles with independent equipment/spell compendia.
- Per-profile item-level limits, rarity access, buy/sell multipliers, full-value treasure rules, and scroll/wand enablement.
- Live market-profile selector refresh across clients.
- Configurable maximum visible catalog entries.
- Inventory-sheet and Actor Directory launch points.
- PF2e capability guards before economic mutation.
- GM-authoritative cross-client transaction coordination and idempotent operation IDs.

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
- Scroll and standard-wand availability

The global **Maximum entries per market list** option remains a world setting because it controls UI result size rather than market economics.

## Transaction boundary

The cart is always a local draft. Real checkout is freshly resolved and priced by the designated active GM. The GM rechecks the current market profile, Actor state, item/spell data, quantities, currency, permissions, item-level/rarity/source availability, and PF2e write capabilities before mutation.

Transactions touching a shared inventory Actor or currency Actor are serialized. This prevents simultaneous clients from selling the same Party item twice or spending the same Party funds concurrently.

Checkout retries retain a stable operation ID while the cart remains unchanged, preventing a delayed response from causing a duplicate transaction.

## Public API v1

```js
const marketForge = game.modules.get("pf2e-market-forge").api;

await marketForge.open({ actorUuid: "Actor...", initialMode: "buy" });
marketForge.getProfiles();
marketForge.getProfile("default");
marketForge.getDefaultProfile();
await marketForge.diagnose();
await marketForge.diagnose({ actorUuid: "Actor..." });
```

The diagnostics result is JSON-safe and includes module/system versions, profile summary, PF2e capability status, optional Actor write capability, and current GM transport/session state.

Transaction execution, adapters, plans, and quote engines are intentionally not public v0.1 API.

## Still intentionally inactive

- Choosing a different character/Party Actor as payment source, purchase recipient, sale source, or proceeds recipient.
- Real merchant Actors and finite merchant stock.
- Mixed payment sources.

## Development and release validation

Run the automated contract suite with:

```bash
npm test
```

The Node suite does not replace a real Foundry multiplayer check. The final manual acceptance matrix is in [`docs/RELEASE_CHECKLIST.md`](docs/RELEASE_CHECKLIST.md), including simultaneous Party sales/purchases and requester-session renewal.
