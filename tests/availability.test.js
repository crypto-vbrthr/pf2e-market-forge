import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultMarketProfile } from "../scripts/market/profile-defaults.js";
import { evaluateAvailability } from "../scripts/market/availability-service.js";

describe("Availability contract", () => {
  const profile = createDefaultMarketProfile({
    sources: { itemCompendia: ["pf2e.equipment-srd"] }
  });

  it("allows an item that passes level, rarity, and source checks", () => {
    const result = evaluateAvailability({
      level: 4,
      rarity: "common",
      sourcePack: "pf2e.equipment-srd"
    }, profile, { maximumItemLevel: 5 });

    assert.equal(result.available, true);
    assert.deepEqual(result.reasons, []);
  });

  it("returns all relevant rejection reasons", () => {
    const result = evaluateAvailability({
      level: 9,
      rarity: "rare",
      sourcePack: "world.secret-items"
    }, profile, { maximumItemLevel: 5 });

    assert.equal(result.available, false);
    assert.ok(result.reasons.includes("level-too-high"));
    assert.ok(result.reasons.includes("rarity-not-allowed"));
    assert.ok(result.reasons.includes("source-not-allowed"));
  });
});
