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

  it("updates quantities, totals, removes lines, and clears the purchase cart", () => {
    const cart = new CartService();
    const line = cart.add({
      direction: "buy",
      product: { kind: "item", sourceUuid: "Item.edit" },
      quantity: 2,
      quote: { unitPrice: 175, totalPrice: 350 }
    });

    cart.setQuantity("buy", line.id, 4);
    assert.equal(cart.getQuotedTotal("buy"), 700);
    assert.equal(cart.getState().buyLines[0].quantity, 4);
    assert.equal(cart.remove("buy", line.id), true);
    assert.equal(cart.getQuotedTotal("buy"), 0);

    cart.add({
      direction: "buy",
      product: { kind: "item", sourceUuid: "Item.clear" },
      quantity: 1,
      quote: { unitPrice: 100, totalPrice: 100 }
    });
    cart.clear("buy");
    assert.equal(cart.getState().buyLines.length, 0);
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

describe("Sale cart contract", () => {
  it("merges the same concrete inventory item and keeps sale totals separate from purchases", () => {
    const cart = new CartService();
    const product = { kind: "item", inventoryItemUuid: "Actor.hero.Item.potion", name: "Potion" };

    cart.add({ direction: "sell", product, quantity: 1, quote: { unitPrice: 200, totalPrice: 200 } });
    cart.add({ direction: "sell", product, quantity: 2, quote: { unitPrice: 200, totalPrice: 400 } });

    const state = cart.getState();
    assert.equal(state.sellLines.length, 1);
    assert.equal(state.sellLines[0].quantity, 3);
    assert.equal(cart.getQuotedTotal("sell"), 600);
    assert.equal(cart.getQuotedTotal("buy"), 0);
  });

  it("tracks the active cart direction without mutating either cart", () => {
    const cart = new CartService();
    assert.equal(cart.getState().activeDirection, "buy");
    cart.setActiveDirection("sell");
    assert.equal(cart.getState().activeDirection, "sell");
    assert.equal(cart.getState().buyLines.length, 0);
    assert.equal(cart.getState().sellLines.length, 0);
  });
});

describe("Cart fractional-copper display contract", () => {
  it("preserves an authoritative once-rounded line total when quantities change", async () => {
    const { PriceService } = await import("../scripts/pricing/price-service.js");
    const { createDefaultMarketProfile } = await import("../scripts/market/profile-defaults.js");
    const pricing = new PriceService();
    const profile = createDefaultMarketProfile();
    const cart = new CartService();
    const product = { kind: "item", inventoryItemUuid: "Actor.hero.Item.tiny", name: "Tiny Item" };
    const line = cart.add({ direction: "sell", product, quantity: 2, quote: pricing.quoteSale({ baseUnitPrice: 5 }, 2, profile) });
    assert.equal(cart.getQuotedTotal("sell"), 5);
    cart.setQuantity("sell", line.id, 4);
    assert.equal(cart.getQuotedTotal("sell"), 10);
  });
});


describe("Cart grouped-price contract", () => {
  it("recomputes a price.per line from the declared stack price when quantity changes", async () => {
    const { PriceService } = await import("../scripts/pricing/price-service.js");
    const { createDefaultMarketProfile } = await import("../scripts/market/profile-defaults.js");
    const pricing = new PriceService();
    const profile = createDefaultMarketProfile();
    const cart = new CartService();
    const product = { kind: "item", sourceUuid: "Compendium.test.Item.bundle", name: "Bundle" };
    const quote = pricing.quotePurchase({ baseUnitPrice: 0, stackPrice: 1, pricePer: 10 }, 1, profile);
    const line = cart.add({ direction: "buy", product, quantity: 1, quote });

    assert.equal(cart.getQuotedTotal("buy"), 0);
    cart.setQuantity("buy", line.id, 10);
    assert.equal(cart.getQuotedTotal("buy"), 1);
  });
});
