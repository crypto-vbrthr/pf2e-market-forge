import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { CartService } from "../scripts/cart/cart-service.js";
import { createRuntimeId } from "../scripts/core/id.js";

const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
const previousFoundry = globalThis.foundry;

before(() => {
  Object.defineProperty(globalThis, "crypto", {
    value: {},
    configurable: true,
    enumerable: true,
    writable: true
  });
  globalThis.foundry = {
    utils: {
      randomID: (length = 16) => "P".repeat(length)
    }
  };
});

after(() => {
  if (cryptoDescriptor) Object.defineProperty(globalThis, "crypto", cryptoDescriptor);
  else delete globalThis.crypto;
  if (previousFoundry === undefined) delete globalThis.foundry;
  else globalThis.foundry = previousFoundry;
});

describe("player-safe runtime IDs", () => {
  it("uses Foundry randomID when crypto.randomUUID is unavailable", () => {
    assert.equal(createRuntimeId(20), "P".repeat(20));
  });

  it("can create purchase and sale cart lines without crypto.randomUUID", () => {
    const cart = new CartService();
    const buy = cart.add({
      direction: "buy",
      quantity: 1,
      quote: { unitPrice: 100, totalPrice: 100 },
      product: {
        kind: "item",
        sourceUuid: "Compendium.pf2e.equipment-srd.Item.test",
        name: "Test Item",
        img: "icons/svg/item-bag.svg",
        level: 1
      }
    });
    const sell = cart.add({
      direction: "sell",
      quantity: 1,
      quote: { unitPrice: 50, totalPrice: 50 },
      product: {
        kind: "item",
        inventoryItemUuid: "Actor.hero.Item.test",
        name: "Owned Test Item",
        img: "icons/svg/item-bag.svg",
        level: 1
      }
    });

    assert.equal(buy.id, "P".repeat(24));
    assert.equal(sell.id, "P".repeat(24));
    assert.equal(cart.getState().buyLines.length, 1);
    assert.equal(cart.getState().sellLines.length, 1);
  });
});
