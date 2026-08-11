import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MarketProfileService } from "../scripts/market/profile-service.js";
import { createDefaultMarketProfile } from "../scripts/market/profile-defaults.js";

describe("MarketProfileService contract", () => {
  it("ships with a default profile", () => {
    const service = new MarketProfileService();
    assert.equal(service.getProfiles().length, 1);
    assert.equal(service.getProfile("default").id, "default");
  });

  it("returns clones instead of mutable profile references", () => {
    const service = new MarketProfileService();
    const profile = service.getProfile("default");
    profile.pricing.sellMultiplier = 99;
    assert.equal(service.getProfile("default").pricing.sellMultiplier, 0.5);
  });

  it("rejects invalid profiles", () => {
    const service = new MarketProfileService();
    const invalid = createDefaultMarketProfile({ availability: { levelLimit: { mode: "fixed", fixedLevel: -2 } } });
    assert.throws(() => service.setProfile(invalid), /Invalid MarketProfile/);
  });
});
