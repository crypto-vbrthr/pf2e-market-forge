import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeCheckoutRequest } from "../scripts/transactions/checkout-contract.js";

describe("Checkout request contract", () => {
  it("keeps intent but strips every client-supplied price field", () => {
    const normalized = normalizeCheckoutRequest({
      direction: "buy",
      profileId: "default",
      itemActorUuid: "Actor.pc",
      currencyActorUuid: "Actor.party",
      requestedByUserId: "User.player",
      total: 1,
      lines: [{
        quantity: 2,
        quotedUnitPrice: 1,
        product: {
          kind: "item",
          sourceUuid: "Compendium.pf2e.equipment-srd.Item.test",
          name: "Expensive Item",
          price: 1,
          unitPrice: 1,
          totalPrice: 2,
          baseUnitPrice: 1,
          multiplier: 0.00001
        }
      }]
    });

    assert.equal("total" in normalized, false);
    assert.equal("quotedUnitPrice" in normalized.lines[0], false);
    assert.deepEqual(normalized.lines[0].product, {
      kind: "item",
      sourceUuid: "Compendium.pf2e.equipment-srd.Item.test",
      name: "Expensive Item"
    });
  });

  it("rejects empty checkout requests", () => {
    assert.throws(() => normalizeCheckoutRequest({
      direction: "buy",
      profileId: "default",
      itemActorUuid: "Actor.pc",
      currencyActorUuid: "Actor.pc",
      requestedByUserId: "User.player",
      lines: []
    }));
  });
});
