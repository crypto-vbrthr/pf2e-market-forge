import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultMarketProfile } from "../scripts/market/profile-defaults.js";
import { validateMarketProfile } from "../scripts/market/profile-validator.js";

describe("MarketProfile contract", () => {
  it("creates a valid schema-v1 default profile", () => {
    const profile = createDefaultMarketProfile();
    assert.deepEqual(validateMarketProfile(profile), { valid: true, errors: [] });
  });

  it("deep-merges nested overrides without destroying defaults", () => {
    const profile = createDefaultMarketProfile({
      id: "ostwall",
      availability: { levelLimit: { offset: 1 } }
    });

    assert.equal(profile.id, "ostwall");
    assert.equal(profile.availability.levelLimit.mode, "party-average");
    assert.equal(profile.availability.levelLimit.offset, 1);
    assert.equal(profile.pricing.sellMultiplier, 0.5);
  });

  it("rejects malformed fixed-level profiles", () => {
    const profile = createDefaultMarketProfile({
      availability: { levelLimit: { mode: "fixed", fixedLevel: -1 } }
    });
    assert.equal(validateMarketProfile(profile).valid, false);
  });
});
