import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeCheckoutIntent, normalizeCheckoutRequest } from "../scripts/transactions/checkout-contract.js";

const intent = () => ({
  direction: "buy",
  profileId: "default",
  itemActorUuid: "Actor.pc",
  currencyActorUuid: "Actor.party",
  operationId: "op-123",
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

describe("Checkout request contract", () => {
  it("keeps intent but strips every client-supplied price field", () => {
    const normalized = normalizeCheckoutRequest(intent(), { requestedByUserId: "User.player" });

    assert.equal("total" in normalized, false);
    assert.equal(normalized.operationId, "op-123");
    assert.equal(normalized.requestedByUserId, "User.player");
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
      lines: []
    }, { requestedByUserId: "User.player" }));
  });

  it("never accepts requester identity from the request body", () => {
    const request = intent();
    request.requestedByUserId = "User.spoofed";
    assert.throws(() => normalizeCheckoutRequest(request), /Authoritative requestedByUserId/);
    const normalized = normalizeCheckoutRequest(request, { requestedByUserId: "User.actual" });
    assert.equal(normalized.requestedByUserId, "User.actual");
  });

  it("can normalize pure client intent without attaching identity", () => {
    const request = intent();
    request.requestedByUserId = "User.spoofed";
    const normalized = normalizeCheckoutIntent(request);
    assert.equal("requestedByUserId" in normalized, false);
    assert.equal(normalized.lines.length, 1);
  });
});
