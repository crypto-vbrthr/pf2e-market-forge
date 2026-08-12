import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MarketProductResolver } from "../scripts/market/product-resolver.js";
import { createDefaultMarketProfile } from "../scripts/market/profile-defaults.js";

describe("shared MarketProductResolver contract", () => {
  it("uses the same fresh catalog resolution contract for authoritative item checkout", async () => {
    const calls = [];
    const expected = { uuid: "Compendium.market.Item.one", name: "One", baseUnitPrice: 100, availability: { available: true, reasons: [] } };
    const resolver = new MarketProductResolver({
      catalogService: {
        async getEntry(uuid, options) { calls.push({ uuid, options }); return expected; }
      },
      saleInventoryService: { async getEntry() { throw new Error("sale path not expected"); } }
    });
    const profile = createDefaultMarketProfile({ sources: { itemCompendia: ["market"] } });
    const result = await resolver.resolve(
      { kind: "item", sourceUuid: "Compendium.market.Item.one" },
      { profile, maximumItemLevel: 8, authoritative: true, direction: "buy", itemActorUuid: "Actor.pc" }
    );
    assert.equal(result, expected);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.fresh, true);
    assert.equal(calls[0].options.maximumItemLevel, 8);
    assert.equal(calls[0].options.profile.id, "default");
  });

  it("re-resolves the exact owned inventory item for sale", async () => {
    const calls = [];
    const expected = { uuid: "Actor.party.Item.gem", quantity: 1, availability: { available: true, reasons: [] } };
    const resolver = new MarketProductResolver({
      catalogService: { async getEntry() { throw new Error("buy path not expected"); } },
      saleInventoryService: {
        async getEntry(actorUuid, itemUuid) { calls.push([actorUuid, itemUuid]); return expected; }
      }
    });
    const result = await resolver.resolve(
      { kind: "item", inventoryItemUuid: "Actor.party.Item.gem" },
      { profile: createDefaultMarketProfile(), direction: "sell", itemActorUuid: "Actor.party", authoritative: true }
    );
    assert.equal(result, expected);
    assert.deepEqual(calls, [["Actor.party", "Actor.party.Item.gem"]]);
  });

  it("applies profile spell-item enablement before generating a purchase source", async () => {
    const oldConfig = globalThis.CONFIG;
    globalThis.CONFIG = {
      PF2E: {
        spellcastingItems: {
          scroll: { compendiumUuids: { 1: "Compendium.pf2e.equipment-srd.Item.scroll1" } },
          wand: { compendiumUuids: { 3: "Compendium.pf2e.equipment-srd.Item.wand3" } }
        }
      }
    };
    let generated = false;
    try {
      const resolver = new MarketProductResolver({
        spellCatalogService: {
          async getEntry() {
            return { uuid: "Compendium.spells.Item.magic", name: "Magic", baseRank: 1, rarity: "common", sourcePack: "pf2e.spells-srd", cost: "", img: "magic.webp" };
          },
          async getSpell() { return { type: "spell", name: "Magic" }; }
        },
        spellItemService: {
          createDraft() {
            return { kind: "wand", spellUuid: "Compendium.spells.Item.magic", castRank: 1, itemLevel: 3, baseUnitPrice: 6000, availability: { available: true, reasons: [] } };
          }
        },
        spellItemAdapter: { async createSource() { generated = true; return { name: "Wand", img: "wand.webp" }; } },
        saleInventoryService: { async getEntry() { return null; } }
      });
      const profile = createDefaultMarketProfile({ spellItems: { wands: false } });
      const result = await resolver.resolve(
        { kind: "wand", spellUuid: "Compendium.spells.Item.magic", spellRank: 1 },
        { profile, direction: "buy", maximumItemLevel: 10, authoritative: true }
      );
      assert.equal(result.availability.available, false);
      assert.ok(result.availability.reasons.includes("spell-item-type-disabled"));
      assert.equal(generated, false);
    } finally {
      globalThis.CONFIG = oldConfig;
    }
  });
});
