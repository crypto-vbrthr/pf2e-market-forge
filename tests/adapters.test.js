import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CurrencyAdapter } from "../scripts/pf2e/currency-adapter.js";
import { InventoryAdapter } from "../scripts/pf2e/inventory-adapter.js";
import { SpellItemAdapter } from "../scripts/pf2e/spell-item-adapter.js";

describe("PF2e adapter boundary", () => {
  it("builds PF2e scroll sources from the system base item and embeds the selected heightened spell", async () => {
    const base = {
      type: "consumable",
      toObject: () => ({
        _id: "base-scroll",
        type: "consumable",
        name: "Base Scroll",
        img: "scroll.webp",
        system: {
          category: "scroll",
          traits: { rarity: "common", value: ["consumable", "magical"] },
          description: { value: "<p>Base rules</p>" },
          level: { value: 1 },
          price: { value: { gp: 4 }, per: 1 }
        }
      })
    };
    const spell = {
      type: "spell",
      uuid: "Compendium.pf2e.spells-srd.Item.fireball",
      sourceId: "Compendium.pf2e.spells-srd.Item.fireball",
      name: "Fireball",
      rarity: "uncommon",
      system: { traits: { rarity: "uncommon", value: ["fire", "arcane"] } },
      toObject: () => ({
        _id: "spell-id",
        type: "spell",
        name: "Fireball",
        system: {
          traits: { rarity: "uncommon", value: ["fire", "arcane"] },
          location: { value: "slot", heightenedLevel: null }
        }
      })
    };
    const adapter = new SpellItemAdapter({
      resolver: async (uuid) => uuid === "Base.Scroll.3" ? base : spell,
      configProvider: () => ({ scroll: { compendiumUuids: { 3: "Base.Scroll.3" }, nameTemplate: "PF2E.ScrollTemplate" } }),
      localize: (key, data) => `${data.name} · ${data.level}`,
      idFactory: () => "embedded-spell"
    });
    const source = await adapter.createScrollSource({
      kind: "scroll", spellUuid: spell.uuid, castRank: 3, itemLevel: 5, baseUnitPrice: 3000, rarity: "uncommon"
    });

    assert.equal(source._id, null);
    assert.equal(source.name, "Fireball · 3");
    assert.equal(source.system.level.value, 5);
    assert.deepEqual(source.system.price, { value: { pp: 3, gp: 0, sp: 0, cp: 0 }, per: 1 });
    assert.equal(source.system.traits.rarity, "uncommon");
    assert.deepEqual(source.system.traits.value, ["arcane", "consumable", "fire"]);
    assert.match(source.system.description.value, /@UUID\[Compendium\.pf2e\.spells-srd\.Item\.fireball\]/);
    assert.equal(source.system.spell._id, "embedded-spell");
    assert.equal(source.system.spell.system.location.value, null);
    assert.equal(source.system.spell.system.location.heightenedLevel, 3);
  });

  it("falls back to PF2e denomination fields when no copperValue getter is exposed", async () => {
    const actor = { inventory: { currency: { gp: 12, sp: 3, cp: 4 } } };
    const adapter = new CurrencyAdapter({ actorProvider: async () => actor });
    assert.equal(await adapter.getBalance("Actor.x"), 1234);
  });

  it("uses PF2e addCurrency/removeCurrency with by-value removal", async () => {
    let copper = 12345;
    const calls = [];
    const actor = {
      inventory: {
        get currency() { return { copperValue: copper }; },
        async removeCurrency(coins, options) {
          calls.push(["remove", coins, options]);
          const value = coins.pp * 1000 + coins.gp * 100 + coins.sp * 10 + coins.cp;
          if (value > copper) return false;
          copper -= value;
          return true;
        },
        async addCurrency(coins, options) {
          calls.push(["add", coins, options]);
          copper += coins.pp * 1000 + coins.gp * 100 + coins.sp * 10 + coins.cp;
        }
      }
    };
    const adapter = new CurrencyAdapter({ actorProvider: async () => actor });

    assert.equal(await adapter.remove("Actor.x", 2345), true);
    assert.equal(await adapter.getBalance("Actor.x"), 10000);
    await adapter.add("Actor.x", 345);
    assert.equal(await adapter.getBalance("Actor.x"), 10345);
    assert.deepEqual(calls[0], ["remove", { pp: 2, gp: 3, sp: 4, cp: 5 }, { byValue: true }]);
    assert.deepEqual(calls[1], ["add", { pp: 0, gp: 3, sp: 4, cp: 5 }, { combineStacks: true }]);
  });

  it("adds an already generated physical source through the same stack-aware inventory path", async () => {
    const actor = {
      inventory: {
        findStackableItem: () => null,
        async add(source) {
          assert.equal(source._id, undefined);
          assert.equal(source.system.quantity, 2);
          assert.equal(source.system.spell.system.location.heightenedLevel, 3);
          return [{ id: "generated-scroll" }];
        }
      }
    };
    const adapter = new InventoryAdapter({ actorProvider: async () => actor });
    const mutation = await adapter.addSource("Actor.x", {
      _id: null,
      type: "consumable",
      system: { quantity: 1, spell: { system: { location: { heightenedLevel: 3 } } } }
    }, 2, { sourceUuid: "spell-product:scroll:x:3" });
    assert.equal(mutation.type, "create");
    assert.equal(mutation.itemId, "generated-scroll");
  });

  it("records a created item and deletes exactly that item on rollback", async () => {
    const deleted = [];
    const actor = {
      inventory: {
        findStackableItem: () => null,
        async add(source) {
          assert.equal(source.system.quantity, 3);
          return [{ id: "created-1" }];
        }
      },
      async deleteEmbeddedDocuments(type, ids) { deleted.push([type, ids]); }
    };
    const item = { toObject: () => ({ _id: "source", type: "equipment", system: { quantity: 1 } }) };
    const adapter = new InventoryAdapter({ actorProvider: async () => actor, itemProvider: async () => item });
    const mutation = await adapter.addFromUuid("Actor.x", "Compendium.x.Item.y", 3);
    assert.equal(mutation.type, "create");
    assert.equal(mutation.itemId, "created-1");
    await adapter.rollbackMutation(mutation);
    assert.deepEqual(deleted, [["Item", ["created-1"]]]);
  });

  it("records a stack quantity and restores that exact quantity on rollback", async () => {
    const updates = [];
    const existing = { id: "stack-1", quantity: 4 };
    const actor = {
      inventory: {
        findStackableItem: () => existing,
        async add() { return [{ id: "stack-1" }]; }
      },
      async updateEmbeddedDocuments(type, data) { updates.push([type, data]); }
    };
    const item = { toObject: () => ({ type: "consumable", system: { quantity: 1 } }) };
    const adapter = new InventoryAdapter({ actorProvider: async () => actor, itemProvider: async () => item });
    const mutation = await adapter.addFromUuid("Actor.x", "Compendium.x.Item.potion", 2);
    assert.deepEqual(mutation, {
      type: "stack-update",
      actorUuid: "Actor.x",
      itemId: "stack-1",
      sourceUuid: "Compendium.x.Item.potion",
      addedQuantity: 2,
      previousQuantity: 4
    });
    await adapter.rollbackMutation(mutation);
    assert.deepEqual(updates, [["Item", [{ _id: "stack-1", "system.quantity": 4 }]]]);
  });
});

describe("PF2e sale inventory mutations", () => {
  it("reduces a partial owned stack and restores its exact previous quantity", async () => {
    const updates = [];
    const owned = {
      uuid: "Actor.x.Item.stack",
      id: "stack",
      actor: { uuid: "Actor.x" },
      quantity: 5,
      system: { quantity: 5 },
      toObject: () => ({ _id: "stack", type: "consumable", system: { quantity: 5 } })
    };
    const actor = {
      uuid: "Actor.x",
      inventory: { get: () => owned },
      async updateEmbeddedDocuments(type, data) { updates.push([type, data]); }
    };
    const adapter = new InventoryAdapter({ actorProvider: async () => actor, itemProvider: async () => owned });
    const mutation = await adapter.removeOwnedItem("Actor.x", owned.uuid, 2);
    assert.deepEqual(mutation, {
      type: "quantity-remove",
      actorUuid: "Actor.x",
      itemId: "stack",
      itemUuid: owned.uuid,
      removedQuantity: 2,
      previousQuantity: 5
    });
    assert.deepEqual(updates[0], ["Item", [{ _id: "stack", "system.quantity": 3 }]]);
    await adapter.rollbackMutation(mutation);
    assert.deepEqual(updates[1], ["Item", [{ _id: "stack", "system.quantity": 5 }]]);
  });

  it("deletes a full owned stack and restores the source with its id on rollback", async () => {
    const deletes = [];
    const creates = [];
    const source = { _id: "sword", type: "weapon", system: { quantity: 1 } };
    const owned = {
      uuid: "Actor.x.Item.sword",
      id: "sword",
      actor: { uuid: "Actor.x" },
      quantity: 1,
      system: { quantity: 1 },
      toObject: () => structuredClone(source)
    };
    const actor = {
      uuid: "Actor.x",
      inventory: { get: () => owned },
      async deleteEmbeddedDocuments(type, ids) { deletes.push([type, ids]); },
      async createEmbeddedDocuments(type, data, options) { creates.push([type, data, options]); }
    };
    const adapter = new InventoryAdapter({ actorProvider: async () => actor, itemProvider: async () => owned });
    const mutation = await adapter.removeOwnedItem("Actor.x", owned.uuid, 1);
    assert.equal(mutation.type, "delete");
    assert.deepEqual(deletes, [["Item", ["sword"]]]);
    await adapter.rollbackMutation(mutation);
    assert.equal(creates[0][0], "Item");
    assert.deepEqual(creates[0][1], [source]);
    assert.equal(creates[0][2].keepId, true);
  });

  it("rejects a sale quantity larger than the live stack", async () => {
    const owned = { uuid: "Actor.x.Item.x", id: "x", actor: { uuid: "Actor.x" }, quantity: 1, system: { quantity: 1 } };
    const actor = { uuid: "Actor.x", inventory: { get: () => owned } };
    const adapter = new InventoryAdapter({ actorProvider: async () => actor, itemProvider: async () => owned });
    await assert.rejects(() => adapter.removeOwnedItem("Actor.x", owned.uuid, 2), (error) => error.code === "insufficient-quantity");
  });
});
