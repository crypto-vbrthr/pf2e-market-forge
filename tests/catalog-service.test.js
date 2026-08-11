import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CatalogService, mapIndexEntry } from "../scripts/catalog/catalog-service.js";
import { createDefaultMarketProfile } from "../scripts/market/profile-defaults.js";

function row({ id, name, type = "equipment", level = 1, rarity = "common", price = { gp: 1 }, per = 1, category = type, traits = [] }) {
  return {
    _id: id,
    name,
    type,
    img: `icons/${id}.webp`,
    system: {
      level: { value: level },
      traits: { rarity, value: traits },
      price: { value: price, per },
      category,
      slug: name.toLowerCase().replaceAll(" ", "-")
    }
  };
}

function makePack(id, entries, calls) {
  return {
    collection: id,
    documentName: "Item",
    metadata: { label: `Pack ${id}` },
    async getIndex() {
      calls.count += 1;
      return new Map(entries.map((entry) => [entry._id, entry]));
    }
  };
}

describe("CatalogService contract", () => {
  it("maps only physical market items and respects price.per", async () => {
    const mapped = mapIndexEntry(row({ id: "bulk", name: "Ten Pieces", price: { sp: 1 }, per: 10 }), "world.items");
    assert.equal(mapped.baseUnitPrice, 1);
    assert.equal(mapped.stackPrice, 10);
    assert.equal(mapped.pricePer, 10);

    assert.equal(mapIndexEntry(row({ id: "feat", name: "Feat", type: "feat" }), "world.items"), null);
    assert.equal(mapIndexEntry(row({ id: "coin", name: "Coin", type: "treasure", category: "coin" }), "world.items"), null);
  });

  it("indexes configured compendia once and filters search, category, level, rarity, and source", async () => {
    const callsA = { count: 0 };
    const callsB = { count: 0 };
    const packA = makePack("world.items-a", [
      row({ id: "sword", name: "Flaming Sword", type: "weapon", level: 2, price: { gp: 10 } }),
      row({ id: "potion", name: "Healing Potion", type: "consumable", level: 3, price: { gp: 12 } }),
      row({ id: "rare", name: "Rare Ring", type: "equipment", level: 3, rarity: "rare", price: { gp: 20 } })
    ], callsA);
    const packB = makePack("world.items-b", [
      row({ id: "shield", name: "Steel Shield", type: "shield", level: 2, price: { gp: 2 } })
    ], callsB);
    const packs = new Map([[packA.collection, packA], [packB.collection, packB]]);
    const service = new CatalogService({ packProvider: () => packs });
    const profile = createDefaultMarketProfile({
      sources: { itemCompendia: [packA.collection, packB.collection] },
      availability: { rarities: { common: true, uncommon: true, rare: true, unique: false } }
    });

    const result = await service.search({
      profile,
      maximumItemLevel: 10,
      filters: { search: "flaming", category: "weapon", level: 2, rarity: "common", sourcePack: packA.collection }
    });
    assert.deepEqual(result.entries.map((entry) => entry.name), ["Flaming Sword"]);

    await service.search({ profile, maximumItemLevel: 10 });
    assert.equal(callsA.count, 1);
    assert.equal(callsB.count, 1);
  });

  it("marks unavailable entries or hides them according to the profile", async () => {
    const calls = { count: 0 };
    const pack = makePack("world.market", [
      row({ id: "ok", name: "Allowed", level: 2 }),
      row({ id: "high", name: "Too High", level: 8 }),
      row({ id: "rare", name: "Too Rare", level: 2, rarity: "rare" })
    ], calls);
    const service = new CatalogService({ packProvider: () => new Map([[pack.collection, pack]]) });
    const base = createDefaultMarketProfile({ sources: { itemCompendia: [pack.collection] } });

    const disabled = await service.search({ profile: base, maximumItemLevel: 5 });
    assert.equal(disabled.entries.length, 3);
    assert.equal(disabled.entries.find((entry) => entry.name === "Allowed").availability.available, true);
    assert.deepEqual(disabled.entries.find((entry) => entry.name === "Too High").availability.reasons, ["level-too-high"]);
    assert.deepEqual(disabled.entries.find((entry) => entry.name === "Too Rare").availability.reasons, ["rarity-not-allowed"]);

    const hidden = createDefaultMarketProfile({
      sources: { itemCompendia: [pack.collection] },
      availability: { unavailableDisplay: "hidden" }
    });
    const hiddenResult = await service.search({ profile: hidden, maximumItemLevel: 5 });
    assert.deepEqual(hiddenResult.entries.map((entry) => entry.name), ["Allowed"]);
  });

  it("re-resolves a cart product by UUID and reapplies current market availability", async () => {
    const calls = { count: 0 };
    const pack = makePack("world.checkout", [
      row({ id: "item", name: "Checkout Item", level: 6, price: { gp: 25 } })
    ], calls);
    const service = new CatalogService({ packProvider: () => new Map([[pack.collection, pack]]) });
    const profile = createDefaultMarketProfile({ sources: { itemCompendia: [pack.collection] } });
    const uuid = `Compendium.${pack.collection}.Item.item`;

    const available = await service.getEntry(uuid, { profile, maximumItemLevel: 6 });
    assert.equal(available.name, "Checkout Item");
    assert.equal(available.baseUnitPrice, 2500);
    assert.equal(available.availability.available, true);

    const blocked = await service.getEntry(uuid, { profile, maximumItemLevel: 5 });
    assert.equal(blocked.availability.available, false);
    assert.deepEqual(blocked.availability.reasons, ["level-too-high"]);
    assert.equal(calls.count, 1);
  });

  it("can bypass the cached index for authoritative checkout revalidation", async () => {
    const calls = { count: 0 };
    const pack = makePack("world.fresh", [row({ id: "item", name: "Fresh Item", price: { gp: 1 } })], calls);
    const service = new CatalogService({ packProvider: () => new Map([[pack.collection, pack]]) });
    const profile = createDefaultMarketProfile({ sources: { itemCompendia: [pack.collection] } });
    const uuid = `Compendium.${pack.collection}.Item.item`;

    await service.getEntry(uuid, { profile, maximumItemLevel: 5 });
    await service.getEntry(uuid, { profile, maximumItemLevel: 5 });
    assert.equal(calls.count, 1);
    await service.getEntry(uuid, { profile, maximumItemLevel: 5, fresh: true });
    assert.equal(calls.count, 2);
  });

  it("reports missing configured compendia without crashing the market", async () => {
    const service = new CatalogService({ packProvider: () => new Map() });
    const profile = createDefaultMarketProfile({ sources: { itemCompendia: ["world.missing"] } });
    const result = await service.search({ profile, maximumItemLevel: 5 });
    assert.equal(result.entries.length, 0);
    assert.equal(result.sources[0].status, "missing");
    assert.match(result.sources[0].error, /Compendium not found/);
  });
});
