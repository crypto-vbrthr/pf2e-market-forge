import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { registerSettings, SETTINGS } from "../scripts/settings/register-settings.js";

const registered = new Map();
const menus = new Map();
globalThis.game = {
  settings: {
    register(namespace, key, data) {
      registered.set(`${namespace}.${key}`, data);
    },
    registerMenu(namespace, key, data) {
      menus.set(`${namespace}.${key}`, data);
    }
  }
};

describe("Foundry settings registration", () => {
  it("registers global UI settings, hidden M6 migration values, and the profile manager menu", () => {
    registered.clear();
    menus.clear();
    registerSettings();

    for (const key of [SETTINGS.SHOW_INVENTORY_BUTTON, SETTINGS.SHOW_ACTOR_CONTEXT_MENU, SETTINGS.MARKET_LIST_LIMIT]) {
      const setting = registered.get(`pf2e-market-forge.${key}`);
      assert.ok(setting, `missing setting ${key}`);
      assert.equal(setting.scope, "world");
      assert.equal(setting.config, true);
    }

    for (const key of [
      SETTINGS.MARKET_LEVEL_MODE,
      SETTINGS.MARKET_FIXED_LEVEL,
      SETTINGS.MARKET_LEVEL_OFFSET,
      SETTINGS.MARKET_LEVEL_ROUNDING,
      SETTINGS.MARKET_PROFILES,
      SETTINGS.DEFAULT_PROFILE_ID
    ]) {
      const setting = registered.get(`pf2e-market-forge.${key}`);
      assert.ok(setting, `missing hidden setting ${key}`);
      assert.equal(setting.scope, "world");
      assert.equal(setting.config, false);
    }

    assert.equal(registered.get(`pf2e-market-forge.${SETTINGS.MARKET_LIST_LIMIT}`).default, 150);
    assert.deepEqual(registered.get(`pf2e-market-forge.${SETTINGS.MARKET_LIST_LIMIT}`).range, { min: 25, max: 500, step: 25 });
    assert.equal(registered.get(`pf2e-market-forge.${SETTINGS.MARKET_PROFILES}`).default, "");
    assert.equal(registered.get(`pf2e-market-forge.${SETTINGS.DEFAULT_PROFILE_ID}`).default, "default");

    const menu = menus.get("pf2e-market-forge.marketProfilesMenu");
    assert.ok(menu);
    assert.equal(menu.restricted, true);
    assert.equal(typeof menu.type, "function");
  });
});
