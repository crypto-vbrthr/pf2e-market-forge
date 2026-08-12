import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { registerSettings, SETTINGS } from "../scripts/settings/register-settings.js";

const registered = new Map();
globalThis.game = {
  settings: {
    register(namespace, key, data) {
      registered.set(`${namespace}.${key}`, data);
    }
  }
};

describe("Foundry settings registration", () => {
  it("registers the GM market controls as world settings", () => {
    registered.clear();
    registerSettings();

    for (const key of [
      SETTINGS.MARKET_LEVEL_MODE,
      SETTINGS.MARKET_FIXED_LEVEL,
      SETTINGS.MARKET_LEVEL_OFFSET,
      SETTINGS.MARKET_LEVEL_ROUNDING,
      SETTINGS.MARKET_LIST_LIMIT
    ]) {
      const setting = registered.get(`pf2e-market-forge.${key}`);
      assert.ok(setting, `missing setting ${key}`);
      assert.equal(setting.scope, "world");
      assert.equal(setting.config, true);
    }

    assert.equal(registered.get(`pf2e-market-forge.${SETTINGS.MARKET_LEVEL_MODE}`).default, "party-average");
    assert.deepEqual(registered.get(`pf2e-market-forge.${SETTINGS.MARKET_FIXED_LEVEL}`).range, { min: 0, max: 30, step: 1 });
    assert.deepEqual(registered.get(`pf2e-market-forge.${SETTINGS.MARKET_LEVEL_OFFSET}`).range, { min: -20, max: 20, step: 1 });
    assert.equal(registered.get(`pf2e-market-forge.${SETTINGS.MARKET_LEVEL_ROUNDING}`).default, "floor");
    assert.equal(registered.get(`pf2e-market-forge.${SETTINGS.MARKET_LIST_LIMIT}`).default, 150);
    assert.deepEqual(registered.get(`pf2e-market-forge.${SETTINGS.MARKET_LIST_LIMIT}`).range, { min: 25, max: 500, step: 25 });
  });
});
