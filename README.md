# PF2E Market Forge 0.2.1

PF2E Market Forge is a rules-aware marketplace for Foundry VTT with GM-authoritative serialized transactions, persistent market profiles, live PF2e catalog sources, scroll/wand generation, hardened pricing, receipts, and diagnostics.


## Part of the Forge Suite

**Market Forge** is part of the **Forge Suite**, a growing collection of Foundry VTT modules and add-ons built for the busy Game Master. The suite is designed to reduce preparation and bookkeeping, make common GM tasks easier, and add useful tools that help make running and playing campaigns smoother and more enjoyable.

An overview of the Forge Suite, its modules, add-ons, and shared documentation is available here:

**Forge Suite:** https://github.com/crypto-vbrthr/pf2e-forge-suite


## Feedback, Bug Reports & Feature Requests

Found a bug, have an idea for an improvement, or would like to suggest a new feature?

Feedback is always welcome. Please feel free to open a new **GitHub Issue** at any time, whether you want to report a problem, suggest a quality-of-life improvement, propose a new feature, or share an idea for how the module could be made more useful.

When reporting a bug, please include as much relevant information as possible, such as the Foundry VTT version, PF2e system version, module version, steps to reproduce the issue, and any console errors or screenshots that may help identify the problem.

Suggestions and feature requests are equally welcome. Even small ideas can lead to useful improvements.

**Open an issue here:** https://github.com/crypto-vbrthr/pf2e-market-forge/issues


## 0.2.1: Search Focus Hotfix

- Buy and spell-item search fields retain focus across debounced catalog rerenders.
- Cursor position and text selections are restored without scrolling the market window.
- Focus is not reclaimed if the user intentionally moves to another control before the delayed search runs.

## 0.2.0: Optional City Forge Provider Integration

Market profiles can now choose their availability source:

- **Manual Market Profile**
- **City Forge (live)**

A live profile stores only a City Forge source id. It does not copy settlement data into Market Forge.

### What City Forge controls while linked

When `City Forge (live)` is selected, Market Forge reads the current `SettlementEconomyContext` and uses it for:

- effective item-level availability
- common/uncommon/rare/unique availability
- City Forge access rules
- City Forge category / trait / UUID / tradition selectors
- City Forge settlement-feature rules
- City Forge buy-price multipliers

The manual Market Forge level and rarity switches remain stored but are ignored while the live provider is active.

### What Market Forge still controls

Market Forge remains authoritative for:

- item and spell compendium sources
- hidden vs disabled display of unavailable results
- base buy multiplier
- sell multiplier
- full-value treasure sale rules
- scroll/wand enablement
- cart state
- pricing and checkout quotes
- permissions
- inventory/currency mutation
- receipts
- cross-client transaction serialization

City Forge price multipliers compose with the Market Forge **buy** multiplier. They do not alter sale pricing.

### Fail-closed behavior

A live-linked profile never silently falls back to old manual availability values.

If City Forge is inactive, missing, incompatible, or the linked source no longer exists:

- catalog entries are unavailable
- checkout revalidation rejects those entries
- the profile UI displays the broken link

This prevents a disconnected integration from accidentally broadening availability.

### Authoritative checkout invariant

Catalog display and GM-authoritative checkout use the same City Forge provider contract.

During checkout the authority GM:

1. reloads the current MarketProfile
2. creates a fresh City Forge provider session
3. obtains the latest City Forge context
4. re-resolves each requested product
5. reapplies City Forge rules and price multipliers
6. only then validates and executes the transaction

The checkout request never contains trusted City Forge availability or price data supplied by the player.

### Live updates

Open markets listen for:

- `pf2eCityForge.ready`
- `pf2eCityForge.settlementCreated`
- `pf2eCityForge.settlementUpdated`
- `pf2eCityForge.settlementDeleted`

When a live-linked settlement changes, catalog caches are cleared and the open market rerenders from fresh City Forge data.

### Compatibility

- Foundry VTT: 14
- PF2e: required
- Market Forge profile schema: 1
- Market Forge API: 1
- Recommended City Forge: 0.4.0+
- City Forge remains optional

## API

```js
const market = game.modules.get("pf2e-market-forge")?.api;

market.getIntegrations();
// { cityForge: { available, active, apiVersion, ... } }

await market.getCityForgeSources();
```
