import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CurrencyAdapter } from "../scripts/pf2e/currency-adapter.js";
import { InventoryAdapter } from "../scripts/pf2e/inventory-adapter.js";
import { SpellItemAdapter } from "../scripts/pf2e/spell-item-adapter.js";

describe("PF2e adapter boundary", () => {
  it("does not silently mutate Foundry during Milestone 0", async () => {
    await assert.rejects(() => new CurrencyAdapter().remove("Actor.x", 100), /not implemented/i);
    await assert.rejects(() => new InventoryAdapter().addItem("Actor.x", {}, 1), /not implemented/i);
    await assert.rejects(() => new SpellItemAdapter().createScrollSource({}), /not implemented/i);
  });
  it("falls back to PF2e denomination fields when no copperValue getter is exposed", async () => {
    const actor = { inventory: { currency: { gp: 12, sp: 3, cp: 4 } } };
    const adapter = new CurrencyAdapter({ actorProvider: async () => actor });
    assert.equal(await adapter.getBalance("Actor.x"), 1234);
  });
  it("reads PF2e currency balances without mutating the actor", async () => {
    const actor = { inventory: { currency: { copperValue: 12345 } } };
    const adapter = new CurrencyAdapter({ actorProvider: async () => actor });
    assert.equal(await adapter.getBalance("Actor.x"), 12345);
    assert.equal(await adapter.canAfford("Actor.x", 12000), true);
    assert.equal(await adapter.canAfford("Actor.x", 13000), false);
  });

});
