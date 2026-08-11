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
});
