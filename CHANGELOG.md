# Changelog

## 0.2.2

### Fixed
- Party stash items are no longer rejected as equipped or invested when stale equipment state survives an inventory transfer.
- PF2e items with `carried` usage are no longer treated as actively equipped for sale eligibility. PF2e intentionally considers carried-use items equipped for rules activation, which is broader than Market Forge's sale restriction.
- Prefer PF2e's resolved `isInContainer` state over raw `system.containerId` data so stale container references do not block loose inventory items.
- Items genuinely resolved inside a container remain unavailable for sale.

## 0.2.1

### Fixed
- Preserve focus in the Buy search field while its debounced catalog search rerenders the Market Forge window.
- Preserve focus in the Spell Items search field while its debounced spell search rerenders the Market Forge window.
- Restore the cursor or text selection after rerender without forcing the market content to scroll.
- Do not steal focus back if the user deliberately moved to another control before the delayed search executes.

## 0.2.0

### Added
- Optional live City Forge availability provider per MarketProfile.
- City Forge source selector in the Market Profile editor.
- Live settlement / market source discovery.
- City Forge availability overlay for physical item catalogs.
- City Forge availability overlay for spell catalogs and generated scroll/wand products.
- City Forge buy-price multiplier composition.
- Market header display of the active live City Forge source.
- Market API integration diagnostics via `getIntegrations()` and `getCityForgeSources()`.
- Live invalidation hooks for City Forge settlement create/update/delete events.
- Authoritative GM-side City Forge context refresh during checkout.

### Changed
- Manual level and rarity controls are disabled in the profile editor while City Forge is the active availability provider.
- Manual level and rarity gates are ignored for live City Forge profiles.
- Existing profiles are canonicalized with `availability.provider = { type: "manual", sourceId: "" }`.
- Open live-linked markets rerender when City Forge settlement data changes.

### Safety
- Live City Forge profiles fail closed when City Forge or the selected source is unavailable.
- No client-supplied City Forge result is trusted by checkout.
- The authority GM obtains a fresh provider context during serialized checkout revalidation.
- Market Forge still owns source-compendium restrictions, transaction permissions, inventory/currency mutation, and receipts.

### Compatibility
- Profile schema remains v1.
- Existing 0.1.0 profiles remain compatible and automatically operate in manual mode.
- City Forge is optional; manual profiles behave exactly as before.

## 0.1.0 - Initial Release

- Promoted the fully tested `0.1.0-rc.2` codebase to the first stable v0.1 release.
- Removed release-candidate wording from runtime messages, package metadata, documentation, and diagnostics.
- Renamed the RC acceptance checklist to `docs/RELEASE_CHECKLIST.md` for the stable release line.
- No economic, catalog, profile, or transaction behavior changed from `0.1.0-rc.2`.

## 0.1.0-rc.2 - Scroll Position Hotfix

- Preserve the Market Forge content scroll position across ApplicationV2 re-renders.
- Expanding or collapsing item descriptions no longer jumps the buy, sell, or cart view back to the top.
- Uses the native HandlebarsApplicationMixin `scrollable` part contract for `.market-forge-content`.
- Added a regression contract test for the scrollable application part.


## 0.1.0-rc.1 - Final Contract & RC Hardening

- Froze the intended v0.1 Market Forge contracts and added an RC acceptance checklist.
- Replaced client-body requester identity with a short-lived GM-issued per-user checkout session capability. The capability is delivered to the claimed Foundry User through a separate targeted User query and is not returned to the provisioning caller.
- Checkout queries now carry the session token instead of a requester user id; the GM maps the token back to the requester used for Actor permission checks.
- Expired requester sessions are reprovisioned automatically once while retaining the checkout operation id.
- Split pure client `normalizeCheckoutIntent()` from authority-bound `normalizeCheckoutRequest()` so requester identity cannot silently fall back to a payload field.
- Extracted `MarketProductResolver` and use it for both local dry-run resolution and authoritative GM resolution, removing duplicated item/spell availability logic from the two paths.
- Removed unused legacy MarketProfile `transaction` switches from the v0.1 contract and canonicalized old stored profiles by dropping those inert fields.
- Added `game.modules.get("pf2e-market-forge").api.diagnose()` with JSON-safe module, profile, PF2e capability, optional Actor, and transport diagnostics.
- Added German/English localization parity checks and localized requester-session failures.
- Removed stale milestone-only context fields from ApplicationV2 preparation.
- Added shared-product-resolution, requester-session, spoof-resistance, session-renewal, diagnostics, profile-canonicalization, localization, and RC manifest regression coverage.

## 0.0.15 - Authoritative Checkout RPC Hotfix

- Replaced the custom checkout request/response protocol on the raw module socket with Foundry V14 targeted `User#query` RPC to the designated active GM.
- Registered `pf2e-market-forge.checkout` through `CONFIG.queries` during `init`.
- Raw `module.pf2e-market-forge` socket traffic is now limited to non-economic broadcasts such as live market-profile changes.
- Checkout query handlers catch authoritative exceptions and return an immediate structured failure instead of leaving player clients waiting for a 30-second socket timeout.
- Checkout responses sent back to players are reduced to status, totals, warnings/errors and transaction id; full resolved item and rollback snapshots stay on the authoritative GM client.
- Added query transport, handler-exception, timeout and profile-broadcast regression tests.

## 0.0.14 - Transaction & Rules Hardening

- Added GM-authoritative real checkout over the module socket.
- Added cross-client transaction coordination keyed independently to every item/currency actor touched by a checkout.
- The authoritative GM reloads the current market profile and recomputes current market-level availability immediately before checkout.
- Client-supplied checkout prices remain non-authoritative and requester claims in the checkout body are overridden by a separate query-layer requester field. RC1 later replaces that field with a requester-bound session capability.
- Added idempotent checkout operation IDs so timeout retries of an unchanged cart do not execute twice.
- Added operation-ID conflict detection when the same ID is reused with different checkout intent.
- Broadcast GM market-profile changes to open Market Forge windows on other clients.
- Corrected price-multiplier rounding so a line total is rounded once after quantity/stack value is known.
- Preserved PF2e grouped `price.per` semantics in catalog, cart, purchase, and sale pricing.
- Added zero/no-market-price protection without incorrectly rejecting positive grouped prices whose single-unit floor is 0 cp.
- Added fixed spell extra-cost parsing for scroll prices; ambiguous/variable/non-monetary spell costs now block automatic scroll generation.
- Added rank-specific PF2e scroll/wand template capability guards.
- Added global and actor-level PF2e capability checks before mutation.
- Implemented the previously stubbed buy/sell permission service.
- Removed unimplemented public API quote methods instead of exposing throwing stubs.
- Increased GM checkout response timeout to 30 seconds; retries keep the same operation ID while the cart is unchanged.
- Added hardening regression coverage for concurrency, authority, idempotency, grouped prices, spell costs, capabilities, zero-price items, permissions, and socket behavior.

## 0.0.13 - Milestone 7.2 Player Cart Hotfix

- Fixed purchase and sale cart lines failing to be created on player clients where `crypto.randomUUID()` is unavailable.
- Runtime IDs now prefer Foundry VTT's public `foundry.utils.randomID()` helper.
- The same player-safe ID generation is used for transaction IDs and generated spell-item IDs.
- Added regression coverage for a player-like client without `crypto.randomUUID()`.

## 0.0.12 - Milestone 7.1 Hotfix

- Market Forge now listens for profile changes while its window is already open.
- Saving a newly created market profile immediately refreshes the market-profile selector; closing and reopening Market Forge is no longer required.
- Renames and edits of the active profile are reflected immediately.
- Changing the default profile refreshes the selector state immediately.
- Deleting a profile refreshes open Market Forge windows and falls back safely if the active profile was deleted.
- Hook listeners are removed when the Market Forge window closes.
- Added a live-profile-refresh regression test.

## 0.0.11 - Milestone 7

- Added persistent named market profiles stored as world configuration.
- Added a GM-only **Market Profiles & Compendia** configuration submenu.
- Added per-profile equipment and spell compendium source selection.
- Added per-profile maximum item-level mode, fixed level, party offset, rounding, rarity access, unavailable-entry display, buy/sell multipliers, full-value treasure rules, and scroll/wand availability.
- Added a market-profile selector directly to the Market Forge header.
- Added a GM shortcut from the Market Forge window to the profile manager.
- Added a configurable default market profile.
- Migrates the existing M6.x global market-level settings into the initial default profile on first M7 load.
- Existing M6.x level settings remain registered but hidden for migration compatibility; their controls now live in the profile editor.
- Switching markets clears both carts to prevent stale prices or availability from crossing profile boundaries.
- Added persistent profile, compendium discovery, settings-menu, and profile-template regression tests.

## 0.0.10 - Milestone 6.2

- Added a GM world setting for the maximum number of entries shown in market catalog lists.
- The setting applies to both equipment and spell-item catalog results.
- Search and filters continue to operate on the complete indexed catalog before the display limit is applied.
- Default remains 150 entries; configurable from 25 to 500.
- Added registration and normalization regression tests.

## 0.0.9 - Milestone 6.1

- Added GM world settings for market item-level calculation mode.
- Added fixed item-level mode, party average/highest/lowest modes, and unlimited mode.
- Added configurable party-level offset and floor/normal/ceil rounding.
- The default market profile now reads these settings when Market Forge opens and on subsequent renders.
- Added a live calculation summary to the Market Forge header.
- Catalog, scroll/wand configuration, cart validation, and checkout all continue to use the same resolved maximum item level.

## 0.0.8 - Milestone 6

- Added a spell catalog backed by configured PF2e spell compendia.
- Excluded cantrips, focus spells, and rituals from scroll/wand generation.
- Added spell search and filters for base rank, tradition, rarity, and compendium.
- Added scroll and ordinary wand configuration with selectable cast rank.
- Added rules-derived spell-item levels and prices for every supported rank.
- Added heightened spell previews using PF2e spell variants and roll data.
- Added generated scroll/wand cart products, including separate lines per spell, type, and rank.
- Added PF2e spell-item source generation using the system's current base-item templates and embedded-spell data shape.
- Added authoritative checkout regeneration of the selected spell item immediately before purchase.
- Added generated-source insertion through the same stack-aware inventory/rollback path as ordinary purchases.
- Rank 10 spells are limited to scrolls because ordinary rank 10 wands are not supported.
- Added M6 catalog, preview, adapter, generated-source transaction, view-state, and template contract tests.

## 0.0.7 - Milestone 5 Hotfix

- Fixed treasure items such as gems being blocked from sale when PF2e reports them as carried/equipped.
- The equipped-state sale protection now applies only to non-treasure physical items.
- Added a regression test for carried/equipped treasure sale eligibility.

## 0.0.6 - Milestone 5

- Added real sale checkout for character and Party inventories.
- Added sell-inventory mapping with lazy item previews and partial-quantity selection.
- Added separate sale-cart state, quantity editing, removal, totals, dry-run validation, and checkout execution.
- Added standard 50% sale pricing and configured full-value handling for art objects, gems, and materials.
- Added sale protections for currency, temporary/infused, unidentified, equipped, invested, contained, subitem-bearing, quantity-less, and valueless items.
- Added authoritative live re-resolution of inventory items, quantities, sellability, and prices before checkout.
- Added partial stack reduction and full embedded-item deletion with exact compensation records.
- Added compensating sale rollback, including restoration of removed items/quantities and compensation of unexpected partial currency credit.
- Added private sale receipts and non-economic receipt failure behavior.
- Added M5 sale inventory, adapter mutation, pricing, cart, transaction, rollback, receipt, and template contract tests.

## 0.0.5 - Milestone 4

- Added real purchase checkout for character and Party actors.
- Added fresh authoritative catalog re-indexing immediately before checkout.
- Added PF2e currency mutation through `ActorInventory.removeCurrency` / `addCurrency`.
- Added PF2e item insertion and stacking through `ActorInventory.add`.
- Added exact compensation records for newly created items and updated stacks.
- Added compensating rollback: item changes are reversed and purchase value refunded after execution failure.
- Added explicit `completed`, `failed`, `rolled-back`, and `rollback-failed` transaction results.
- Added module-wide same-actor transaction locking and Application checkout busy protection.
- Added permission validation for both item target and currency source.
- Added private chat purchase receipts for the buyer and GMs.
- Receipt failure is non-economic and produces a warning without rolling back a completed purchase.
- Cart is cleared only after successful checkout and preserved after failures.
- Added M4 adapter, transaction execution, rollback, locking, fresh-index, receipt, permission, and template contract tests.

## 0.0.4 - Milestone 3

- Added real purchase cart state with quantity-aware lines.
- Added automatic merging of identical products.
- Added cart quantity editing, removal, and clearing.
- Added live purchase quotes and cart totals through the central `PriceService`.
- Added actor currency balance display and affordability checks.
- Added authoritative checkout dry-run preparation and validation.
- Checkout normalization strips client-supplied price claims and recalculates totals from current catalog data.
- Inventories and currency remained intentionally unchanged in M3.

## 0.0.3 - Milestone 2

- Added a real PF2e equipment catalog backed by configured Item compendia.
- Default market profile now uses `pf2e.equipment-srd` and `pf2e.spells-srd` as its initial sources.
- Added cached compendium indexing with lightweight physical-item metadata.
- Added catalog search and filters for item type, level, rarity, and compendium.
- Added market-level availability checks to the catalog, including disabled/hidden behavior from the MarketProfile contract.
- Added party-aware market maximum resolution using character members of the reference Party actor.
- Added lazy expandable item previews and original PF2e item-sheet opening.
- Added result caps and source diagnostics.

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