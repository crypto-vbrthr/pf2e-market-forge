# PF2E Market Forge

## 0.0.15 Checkout transport hotfix

Player checkout requests now use Foundry V14 targeted User Queries (`game.users.activeGM.query`) instead of a hand-built request/response protocol over the raw module socket. This provides an awaited response from the selected GM client and addresses the observed 30-second player timeout when selling from shared Party inventory. The module socket remains enabled for live market-profile broadcasts.

PF2E Market Forge is a Foundry VTT module for Pathfinder 2e that turns buying and selling equipment into a rules-aware market workflow for characters and the Party stash.

## 0.0.15 — Transaction & Rules Hardening

This build hardens the economic core before release-candidate work. Player checkout is no longer allowed to mutate inventory and currency independently on each client. Real buy/sell transactions are routed to one active GM authority, serialized across every actor touched by the transaction, freshly revalidated, and only then committed through the PF2e adapter boundary.

### Transaction hardening

- Real player checkout is routed through Foundry V14 targeted User Queries to the designated active GM authority.
- The GM reloads the current market profile and recomputes the current maximum item level before every real checkout.
- The GM re-resolves current catalog entries, spells, owned sale items, quantities, prices, permissions, and actor capabilities before mutation.
- Cross-client transactions are serialized on **both** the item actor and currency actor. Transactions sharing either actor cannot mutate that actor concurrently.
- Unrelated actor sets can still transact independently.
- Checkout requests contain intent and quantity, not authoritative prices.
- The requester claimed inside the checkout body is ignored by the authoritative service; the transport-provided requester is used for permission validation.
- Real checkout uses an operation ID. A timeout retry with an unchanged cart is deduplicated instead of executing the same purchase twice.
- Reusing the same operation ID with different checkout contents is rejected.
- Profile changes saved by the GM are broadcast to already-open Market Forge windows on other clients.
- The existing compensating rollback remains in place for failed inventory/currency mutations.

### Rules hardening

- Market multipliers are applied to the complete line value and the final copper total is rounded once, preventing per-unit rounding errors from multiplying across a stack.
- PF2e grouped prices using `price.per` are preserved. A price declared for a bundle is evaluated as a bundle instead of being flattened to a lossy single-unit integer first.
- Physical catalog items with no positive declared market price are disabled instead of becoming free purchases.
- Sale items with no positive declared value remain blocked. Grouped prices with a positive bundle value remain valid even if one individual unit is worth less than 1 cp.
- Fixed monetary spell costs are added to generated scroll prices.
- Variable, non-monetary, or otherwise ambiguous spell costs make automatic scroll generation unavailable rather than silently underpricing the scroll.
- Ordinary wand table prices are unchanged by spell extra-cost parsing.
- Missing PF2e scroll/wand base templates are surfaced as incompatibility/availability failures instead of failing halfway through item creation.

### PF2e compatibility guard

At startup Market Forge checks the global PF2e capabilities it relies on. Real checkout also checks the exact target actors immediately before mutation. If required inventory/document capabilities are absent, the transaction is stopped before economic state is changed.

### Security boundary

Foundry V14 targeted User Queries are used as the request/response transport to the designated active GM. The authoritative GM still validates the claimed active user record and actual actor permissions, and never trusts client-supplied prices or market state. The raw package socket is retained only for non-economic broadcasts such as profile refresh notifications.

## Existing market features

- Buy and sell physical PF2e equipment.
- Character and Party/team inventory support.
- Separate buy/sell carts with quantity editing and totals.
- Automatic currency deduction/credit and inventory mutation.
- Rollback and private chat receipts.
- Expandable item/spell descriptions.
- Scroll and ordinary wand generation with selectable spell rank.
- Named market profiles with independent equipment/spell compendia.
- Per-profile level limits, rarity access, buy/sell multipliers, full-value treasure rules, and scroll/wand availability.
- Live market-profile selector refresh.
- Configurable maximum visible catalog entries.
- Inventory-sheet and Actor Directory launch points.

## Still intentionally inactive

- Choosing a different character/Party actor as payment source, purchase recipient, sale source, or proceeds recipient.
- Real merchant actors and finite merchant stock.
- Mixed payment sources.

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

The global **Maximum entries per market list** option remains a world setting because it controls UI result size rather than market economics.

## Development

Run the contract tests with:

```bash
npm test
```

The automated contract suite does not require a running Foundry instance. Cross-client query transport and serialization should additionally be tested in Foundry with a GM and at least two player clients before RC.
