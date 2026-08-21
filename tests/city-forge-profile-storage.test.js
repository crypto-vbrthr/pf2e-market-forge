import test from "node:test";
import assert from "node:assert/strict";
import { parseProfiles, serializeProfiles } from "../scripts/market/world-profile-service.js";
import { createDefaultMarketProfile } from "../scripts/market/profile-defaults.js";

test("old stored profiles gain a manual provider configuration without schema change", () => {
  const legacy = createDefaultMarketProfile();
  delete legacy.availability.provider;
  const raw = JSON.stringify({ version: 1, profiles: [legacy] });
  const parsed = parseProfiles(raw);
  assert.deepEqual(parsed[0].availability.provider, { type: "manual", sourceId: "" });
});

test("live City Forge source survives profile serialization", () => {
  const profile = createDefaultMarketProfile({
    availability: {
      provider: { type: "city-forge", sourceId: "settlement-1::default" }
    }
  });
  const parsed = parseProfiles(serializeProfiles([profile]));
  assert.deepEqual(parsed[0].availability.provider, {
    type: "city-forge",
    sourceId: "settlement-1::default"
  });
});
