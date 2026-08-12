import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyMarketLevelSettings,
  createConfiguredMarketProfile,
  normalizeMarketLevelSettings,
  readMarketLevelSettings
} from "../scripts/market/profile-settings.js";
import { createDefaultMarketProfile } from "../scripts/market/profile-defaults.js";
import { SETTINGS } from "../scripts/settings/register-settings.js";

const getterFrom = (values) => (key, fallback) => key in values ? values[key] : fallback;

describe("Market level settings bridge", () => {
  it("maps settings into the default profile level-limit contract", () => {
    const getter = getterFrom({
      [SETTINGS.MARKET_LEVEL_MODE]: "party-highest",
      [SETTINGS.MARKET_FIXED_LEVEL]: 14,
      [SETTINGS.MARKET_LEVEL_OFFSET]: 2,
      [SETTINGS.MARKET_LEVEL_ROUNDING]: "ceil"
    });
    const profile = createConfiguredMarketProfile({}, getter);
    assert.deepEqual(profile.availability.levelLimit, {
      mode: "party-highest",
      fixedLevel: 14,
      offset: 2,
      rounding: "ceil"
    });
  });

  it("supports a fixed market level", () => {
    const profile = createConfiguredMarketProfile({}, getterFrom({
      [SETTINGS.MARKET_LEVEL_MODE]: "fixed",
      [SETTINGS.MARKET_FIXED_LEVEL]: 12
    }));
    assert.equal(profile.availability.levelLimit.mode, "fixed");
    assert.equal(profile.availability.levelLimit.fixedLevel, 12);
  });

  it("supports unlimited markets", () => {
    const profile = createConfiguredMarketProfile({}, getterFrom({
      [SETTINGS.MARKET_LEVEL_MODE]: "unlimited"
    }));
    assert.equal(profile.availability.levelLimit.mode, "unlimited");
  });

  it("clamps numeric setting values to supported ranges", () => {
    assert.deepEqual(normalizeMarketLevelSettings({
      mode: "party-average",
      fixedLevel: 999,
      offset: -999,
      rounding: "floor"
    }), {
      mode: "party-average",
      fixedLevel: 30,
      offset: -20,
      rounding: "floor"
    });
  });

  it("falls back from invalid string settings", () => {
    const values = normalizeMarketLevelSettings({ mode: "banana", rounding: "sideways" });
    assert.equal(values.mode, "party-average");
    assert.equal(values.rounding, "floor");
  });

  it("does not mutate the source profile", () => {
    const base = createDefaultMarketProfile();
    const configured = applyMarketLevelSettings(base, { mode: "fixed", fixedLevel: 8, offset: 0, rounding: "floor" });
    assert.equal(base.availability.levelLimit.mode, "party-average");
    assert.equal(configured.availability.levelLimit.mode, "fixed");
  });

  it("reads all four settings through an injectable getter", () => {
    const values = readMarketLevelSettings(getterFrom({
      [SETTINGS.MARKET_LEVEL_MODE]: "party-lowest",
      [SETTINGS.MARKET_FIXED_LEVEL]: 9,
      [SETTINGS.MARKET_LEVEL_OFFSET]: -1,
      [SETTINGS.MARKET_LEVEL_ROUNDING]: "round"
    }));
    assert.deepEqual(values, { mode: "party-lowest", fixedLevel: 9, offset: -1, rounding: "round" });
  });
});
