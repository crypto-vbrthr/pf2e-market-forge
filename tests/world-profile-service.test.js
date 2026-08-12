import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultMarketProfile } from "../scripts/market/profile-defaults.js";
import {
  createProfileId,
  parseProfiles,
  serializeProfiles,
  WorldMarketProfileService
} from "../scripts/market/world-profile-service.js";
import { SETTINGS } from "../scripts/settings/keys.js";

function harness(initial = {}) {
  const store = new Map(Object.entries(initial));
  const getter = (key, fallback) => store.has(key) ? store.get(key) : fallback;
  const setter = async (key, value) => { store.set(key, value); return value; };
  return { store, service: new WorldMarketProfileService({ getter, setter, legacyGetter: getter }) };
}

describe("world market profile storage", () => {
  it("falls back to the M6 level settings before profiles have been persisted", () => {
    const { service } = harness({
      [SETTINGS.MARKET_LEVEL_MODE]: "fixed",
      [SETTINGS.MARKET_FIXED_LEVEL]: 12,
      [SETTINGS.MARKET_LEVEL_OFFSET]: 0,
      [SETTINGS.MARKET_LEVEL_ROUNDING]: "floor"
    });
    const profile = service.getProfiles()[0];
    assert.equal(profile.id, "default");
    assert.equal(profile.availability.levelLimit.mode, "fixed");
    assert.equal(profile.availability.levelLimit.fixedLevel, 12);
  });

  it("drops unused legacy transaction switches when reading stored M7 profiles", () => {
    const legacy = createDefaultMarketProfile({ id: "legacy", name: "Legacy" });
    legacy.transaction = { allowMixedPaymentSources: true, revalidateOnCheckout: false, requireCompleteTransaction: false };
    const raw = JSON.stringify({ version: 1, profiles: [legacy] });
    const [profile] = parseProfiles(raw);
    assert.equal(profile.id, "legacy");
    assert.equal("transaction" in profile, false);
  });

  it("serializes and parses validated named profiles", () => {
    const a = createDefaultMarketProfile({ id: "village", name: "Village" });
    const b = createDefaultMarketProfile({ id: "city", name: "City", sources: { itemCompendia: ["world.city-items"] } });
    const raw = serializeProfiles([a, b]);
    assert.deepEqual(parseProfiles(raw).map((p) => p.id), ["village", "city"]);
    assert.deepEqual(parseProfiles(raw)[1].sources.itemCompendia, ["world.city-items"]);
  });

  it("saves profiles, selects a default, and repairs the default when it is deleted", async () => {
    const initial = serializeProfiles([
      createDefaultMarketProfile({ id: "a", name: "A" }),
      createDefaultMarketProfile({ id: "b", name: "B" })
    ]);
    const { service, store } = harness({
      [SETTINGS.MARKET_PROFILES]: initial,
      [SETTINGS.DEFAULT_PROFILE_ID]: "a"
    });

    const b = service.getProfile("b");
    b.sources.spellCompendia = ["world.spells"];
    await service.saveProfile(b);
    await service.setDefaultProfileId("b");
    assert.equal(service.getDefaultProfileId(), "b");
    assert.deepEqual(service.getProfile("b").sources.spellCompendia, ["world.spells"]);

    await service.deleteProfile("b");
    assert.equal(service.getDefaultProfileId(), "a");
    assert.equal(store.get(SETTINGS.DEFAULT_PROFILE_ID), "a");
  });

  it("creates stable unique profile ids", () => {
    assert.equal(createProfileId("Großer Markt", []), "gro-er-markt");
    assert.equal(createProfileId("City Market", ["city-market", "city-market-2"]), "city-market-3");
  });
});
