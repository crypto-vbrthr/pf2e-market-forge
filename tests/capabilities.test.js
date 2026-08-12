import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasAnySpellItemBaseConfig, hasSpellItemBaseConfig, PF2eCapabilityService } from "../scripts/pf2e/capabilities.js";

describe("PF2e capability guard", () => {
  it("detects missing writable actor inventory methods", () => {
    const actor = { type: "character", inventory: {}, canUserModify() {}, updateEmbeddedDocuments() {}, deleteEmbeddedDocuments() {}, createEmbeddedDocuments() {} };
    const result = new PF2eCapabilityService().assertWritableActor(actor);
    assert.equal(result.compatible, false);
    assert.ok(result.missing.includes("inventory.add"));
    assert.ok(result.errors.includes("pf2e-incompatible"));
  });

  it("detects rank-specific PF2e spell-item template support", () => {
    const config = {
      scroll: { compendiumUuids: { 1: "Compendium.pf2e.equipment-srd.Item.scroll-1", 3: "Compendium.pf2e.equipment-srd.Item.scroll-3" } },
      wand: { compendiumUuids: { 1: "Compendium.pf2e.equipment-srd.Item.wand-1" } }
    };
    assert.equal(hasSpellItemBaseConfig("scroll", 3, config), true);
    assert.equal(hasSpellItemBaseConfig("scroll", 2, config), false);
    assert.equal(hasSpellItemBaseConfig("wand", 10, config), false);
    assert.equal(hasAnySpellItemBaseConfig("scroll", { minimumRank: 2, maximumRank: 3, config }), true);
    assert.equal(hasAnySpellItemBaseConfig("wand", { minimumRank: 2, maximumRank: 9, config }), false);
  });

  it("accepts the inventory capabilities used by Market Forge transactions", () => {
    const actor = {
      type: "party",
      inventory: { add() {}, addCurrency() {}, removeCurrency() {}, currency: { copperValue: 0 } },
      canUserModify() {}, updateEmbeddedDocuments() {}, deleteEmbeddedDocuments() {}, createEmbeddedDocuments() {}
    };
    assert.equal(new PF2eCapabilityService().assertWritableActor(actor).compatible, true);
  });
});
