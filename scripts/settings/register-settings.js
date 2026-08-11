import { MODULE_ID } from "../core/constants.js";

export const SETTINGS = Object.freeze({
  SHOW_INVENTORY_BUTTON: "showInventoryButton",
  SHOW_ACTOR_CONTEXT_MENU: "showActorContextMenu"
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
}

export function getSetting(key, fallback = true) {
  try {
    return game.settings.get(MODULE_ID, key);
  } catch (_error) {
    return fallback;
  }
}
