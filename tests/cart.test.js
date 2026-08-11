import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CartService, productKey } from "../scripts/cart/cart-service.js";

describe("Cart contract", () => {
  it("merges identical buy items into one line", () => {
    const cart = new CartService();
    const product = { kind: "item", sourceUuid: "Compendium.pf2e.equipment-srd.Item.heal", name: "Healing Potion" };

    cart.add({ direction: "buy", product, quantity: 2, quote: { unitPrice: 400, totalPrice: 800 } });
    cart.add({ direction: "buy", product, quantity: 3, quote: { unitPrice: 400, totalPrice: 1200 } });

    const state = cart.getState();
    assert.equal(state.buyLines.length, 1);
    assert.equal(state.buyLines[0].quantity, 5);
    assert.equal(cart.getQuotedTotal("buy"), 2000);
  });

  it("keeps different spell ranks as separate products", () => {
    const rank3 = { kind: "scroll", spellUuid: "Spell.fireball", spellRank: 3 };
    const rank5 = { kind: "scroll", spellUuid: "Spell.fireball", spellRank: 5 };
    assert.notEqual(productKey(rank3, "buy"), productKey(rank5, "buy"));
  });

  it("requires concrete inventory UUIDs for sell items", () => {
    assert.throws(() => productKey({ kind: "item", sourceUuid: "Compendium.foo" }, "sell"));
  });

  it("returns cloned state instead of the live cart object", () => {
    const cart = new CartService();
    cart.add({
      direction: "buy",
      product: { kind: "item", sourceUuid: "Item.one" },
      quantity: 1,
      quote: { unitPrice: 100, totalPrice: 100 }
    });
    const state = cart.getState();
    state.buyLines[0].quantity = 999;
    assert.equal(cart.getState().buyLines[0].quantity, 1);
  });
});
