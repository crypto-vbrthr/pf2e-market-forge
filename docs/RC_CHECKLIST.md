# PF2E Market Forge 0.1.0 RC Checklist

Use this checklist for the final Foundry VTT validation of `0.1.0-rc.2`.

## Installation and startup

- Module enables cleanly in a PF2e world on Foundry V14.
- No Market Forge error appears during `init` or `ready`.
- GM can open the module from a Character inventory, Party inventory, and Actor Directory context action.
- A player can open Market Forge only for actors they are allowed to modify.
- `game.modules.get("pf2e-market-forge").api.diagnose()` returns a JSON-safe report.

## Profiles and catalogs

- Existing M7 profiles survive the update.
- Existing profile level limits, rarity settings, multipliers, and compendium selections remain intact.
- New profiles appear immediately in already-open Market Forge windows.
- A profile change by the GM appears in an already-open player window.
- Missing configured compendia produce a warning but do not break the market window.
- Global maximum list size still limits visible equipment and spell results while search/filtering uses the full source index.

## Purchase flow

- Player can add normal equipment to the buy cart and change quantities.
- Dry run recalculates price and availability.
- Checkout deducts the correct currency and adds/stacks the correct item.
- Item level, rarity, source pack, and market profile changes are revalidated at checkout.
- Items with no positive market price cannot be purchased for free.
- Grouped PF2e `price.per` items retain the correct bundle pricing.
- A failed item write restores already-added items and refunds currency.
- A receipt failure does not reverse an otherwise successful purchase.

## Sale flow

- Player can add owned items to the sale cart and sell partial quantities.
- Standard equipment sells at the configured multiplier.
- Gems/art/materials use the configured full-value exceptions.
- Treasure incorrectly marked carried/equipped by PF2e remains sellable.
- Equipped non-treasure, invested, unidentified, temporary/infused, contained, subitem-bearing, zero-quantity, and valueless items remain blocked.
- If a later sale mutation fails, previously removed items are restored.
- A receipt failure does not reverse an otherwise successful sale.

## Scrolls and wands

- Scrolls can be generated from eligible ordinary spells through rank 10.
- Standard wands can be generated through rank 9.
- Selected heightened rank is embedded into the generated spell source.
- Spell rarity and market availability are respected.
- Fixed monetary spell costs increase scroll price.
- Ambiguous/variable/non-monetary spell costs block automatic scroll creation instead of underpricing it.
- Missing PF2e rank templates make the corresponding spell item unavailable before checkout.

## Multiplayer transaction tests

- Two players simultaneously selling the same single Party item result in exactly one successful sale; the second is freshly rejected.
- Two players simultaneously buying from the same Party purse when funds cover only one purchase result in exactly one successful purchase.
- Two players simultaneously buying from the same Party purse when funds cover both purchases result in both purchases succeeding sequentially with the correct final balance.
- No player checkout waits for the obsolete raw-socket 30-second request/response path.
- A player reconnect/new client can establish a new GM checkout session automatically.
- If a requester session expires, the next checkout reprovisions it and retries once without duplicating the transaction.
- Repeating an unchanged timed-out checkout keeps the same operation id and cannot duplicate the transaction.

## Final acceptance

- Automated Node contract suite is green from the unpacked release ZIP.
- All `.js` files pass syntax checks.
- All `.json` files parse successfully.
- German and English localization contain identical key sets.
- Manual multiplayer tests above are green in a real Foundry world.
