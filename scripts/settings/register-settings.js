import { MODULE_ID } from "../core/constants.js";

export const SETTINGS = Object.freeze({
  SHOW_INVENTORY_BUTTON: "showInventoryButton",
  SHOW_ACTOR_CONTEXT_MENU: "showActorContextMenu",
  MARKET_LEVEL_MODE: "marketLevelMode",
  MARKET_FIXED_LEVEL: "marketFixedLevel",
  MARKET_LEVEL_OFFSET: "marketLevelOffset",
  MARKET_LEVEL_ROUNDING: "marketLevelRounding",
  MARKET_LIST_LIMIT: "marketListLimit"
});

export function registerSettings() {
  game.settings.register(MODULE_ID, SETTINGS.SHOW_INVENTORY_BUTTON, {
    name: "PF2E_MARKET_FORGE.Settings.ShowInventoryButton.Name",
    hint: "PF2E_MARKET_FORGE.Settings.ShowInventoryButton.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.SHOW_ACTOR_CONTEXT_MENU, {
    name: "PF2E_MARKET_FORGE.Settings.ShowActorContextMenu.Name",
    hint: "PF2E_MARKET_FORGE.Settings.ShowActorContextMenu.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.MARKET_LEVEL_MODE, {
    name: "PF2E_MARKET_FORGE.Settings.MarketLevelMode.Name",
    hint: "PF2E_MARKET_FORGE.Settings.MarketLevelMode.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      "party-average": "PF2E_MARKET_FORGE.LevelMode.party-average",
      "party-highest": "PF2E_MARKET_FORGE.LevelMode.party-highest",
      "party-lowest": "PF2E_MARKET_FORGE.LevelMode.party-lowest",
      fixed: "PF2E_MARKET_FORGE.LevelMode.fixed",
      unlimited: "PF2E_MARKET_FORGE.LevelMode.unlimited"
    },
    default: "party-average"
  });

  game.settings.register(MODULE_ID, SETTINGS.MARKET_FIXED_LEVEL, {
    name: "PF2E_MARKET_FORGE.Settings.MarketFixedLevel.Name",
    hint: "PF2E_MARKET_FORGE.Settings.MarketFixedLevel.Hint",
    scope: "world",
    config: true,
    type: Number,
    range: { min: 0, max: 30, step: 1 },
    default: 0
  });

  game.settings.register(MODULE_ID, SETTINGS.MARKET_LEVEL_OFFSET, {
    name: "PF2E_MARKET_FORGE.Settings.MarketLevelOffset.Name",
    hint: "PF2E_MARKET_FORGE.Settings.MarketLevelOffset.Hint",
    scope: "world",
    config: true,
    type: Number,
    range: { min: -20, max: 20, step: 1 },
    default: 0
  });

  game.settings.register(MODULE_ID, SETTINGS.MARKET_LEVEL_ROUNDING, {
    name: "PF2E_MARKET_FORGE.Settings.MarketLevelRounding.Name",
    hint: "PF2E_MARKET_FORGE.Settings.MarketLevelRounding.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      floor: "PF2E_MARKET_FORGE.Rounding.floor",
      round: "PF2E_MARKET_FORGE.Rounding.round",
      ceil: "PF2E_MARKET_FORGE.Rounding.ceil"
    },
    default: "floor"
  });

  game.settings.register(MODULE_ID, SETTINGS.MARKET_LIST_LIMIT, {
    name: "PF2E_MARKET_FORGE.Settings.MarketListLimit.Name",
    hint: "PF2E_MARKET_FORGE.Settings.MarketListLimit.Hint",
    scope: "world",
    config: true,
    type: Number,
    range: { min: 25, max: 500, step: 25 },
    default: 150
  });
}

export function getSetting(key, fallback = true) {
  try {
    return game.settings.get(MODULE_ID, key);
  } catch (_error) {
    return fallback;
  }
}
