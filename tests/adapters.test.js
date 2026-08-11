import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CurrencyAdapter } from "../scripts/pf2e/currency-adapter.js";
import { InventoryAdapter } from "../scripts/pf2e/inventory-adapter.js";
import { SpellItemAdapter } from "../scripts/pf2e/spell-item-adapter.js";

describe("PF2e adapter boundary", () => {
  it("keeps spell-item mutation disabled until the spell milestone", async () => {
    await assert.rejects(() => new SpellItemAdapter().createScrollSource({}), /not implemented/i);
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
