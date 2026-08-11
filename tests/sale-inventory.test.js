import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapOwnedItem, SaleInventoryService } from "../scripts/inventory/sale-inventory-service.js";

function item(overrides = {}) {
  const base = {
    uuid: "Actor.pc.Item.sword",
    id: "sword",
    type: "weapon",
    name: "Sword",
    img: "sword.webp",
    actor: { uuid: "Actor.pc" },
    quantity: 2,
    level: 1,
    rarity: "common",
    traits: new Set(),
    price: { value: { copperValue: 100 }, per: 1 },
    system: {
      quantity: 2,
      traits: { value: [], rarity: "common" },
      identification: { status: "identified" },
      price: { value: { copperValue: 100 }, per: 1 },
      temporary: false,
      containerId: null,
      subitems: []
    },
    isIdentified: true,
    isEquipped: false,
    isInvested: null,
    isInContainer: false,
    isTemporary: false
  };
  return Object.assign(base, overrides);
}

describe("Sale inventory contract", () => {
  it("maps an ordinary owned item with current quantity and unit value", () => {
    const entry = mapOwnedItem(item());
    assert.equal(entry.uuid, "Actor.pc.Item.sword");
    assert.equal(entry.quantity, 2);
    assert.equal(entry.baseUnitPrice, 100);
    assert.equal(entry.availability.available, true);
  });

  it("respects PF2e price.per when determining unit value", () => {
    const owned = item({
      price: { value: { copperValue: 100 }, per: 10 },
      system: {
        ...item().system,
        price: { value: { copperValue: 100 }, per: 10 }
      }
    });
    assert.equal(mapOwnedItem(owned).baseUnitPrice, 10);
  });

  it("marks treasure categories used by full-value sale pricing", () => {
    const gem = item({
      uuid: "Actor.pc.Item.gem",
      id: "gem",
      type: "treasure",
      system: { ...item().system, category: "gem" }
    });
    const entry = mapOwnedItem(gem);
    assert.equal(entry.treasureCategory, "gem");
    assert.equal(entry.availability.available, true);
  });

  it("does not block treasure merely because PF2e reports it as equipped/carried", () => {
    const gem = item({
      uuid: "Actor.pc.Item.gem-carried",
      id: "gem-carried",
      type: "treasure",
      isEquipped: true,
      system: { ...item().system, category: "gem" }
    });
    const entry = mapOwnedItem(gem);
    assert.equal(entry.treasureCategory, "gem");
    assert.equal(entry.availability.available, true);
    assert.equal(entry.availability.reasons.includes("equipped"), false);
  });

  it("blocks currency, temporary, unidentified, equipped, invested, contained, subitem-bearing, and valueless items", () => {
    const cases = [
      ["currency", item({ type: "treasure", isCurrency: true, system: { ...item().system, category: "coin" } })],
      ["temporary", item({ isTemporary: true })],
      ["unidentified", item({ isIdentified: false })],
      ["equipped", item({ isEquipped: true })],
      ["invested", item({ isInvested: true })],
      ["in-container", item({ isInContainer: true })],
      ["has-subitems", item({ subitems: new Map([["x", {}]]) })],
      ["no-value", item({ price: { value: { copperValue: 0 }, per: 1 }, system: { ...item().system, price: { value: { copperValue: 0 }, per: 1 } } })]
    ];

    for (const [reason, owned] of cases) {
      const entry = mapOwnedItem(owned);
      assert.equal(entry.availability.available, false, reason);
      assert.ok(entry.availability.reasons.includes(reason), reason);
    }
  });

  it("lists and re-resolves concrete actor inventory entries", async () => {
    const sword = item();
    const adapter = {
      async getInventory() { return [sword]; },
      async getItem() { return sword; }
    };
    const service = new SaleInventoryService({ inventoryAdapter: adapter });
    assert.equal((await service.list("Actor.pc")).length, 1);
    assert.equal((await service.getEntry("Actor.pc", sword.uuid)).name, "Sword");
    assert.equal(await service.getEntry("Actor.other", sword.uuid), null);
  });
});
