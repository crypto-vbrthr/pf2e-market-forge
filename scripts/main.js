import { MarketForgeAPI } from "./api/market-api.js";
import { MODULE_ID } from "./core/constants.js";
import { registerActorDirectoryIntegration } from "./integrations/actor-directory.js";
import { registerCharacterSheetIntegration } from "./integrations/character-sheet.js";
import { registerPartySheetIntegration } from "./integrations/party-sheet.js";
import { registerSettings } from "./settings/register-settings.js";

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | initializing Milestone 6.2`);

  registerSettings();
  registerCharacterSheetIntegration();
  registerPartySheetIntegration();
  registerActorDirectoryIntegration();

  const module = game.modules.get(MODULE_ID);
  if (module) module.api = new MarketForgeAPI();
});

Hooks.once("ready", () => {
  if (game.system.id !== "pf2e") {
    console.error(`${MODULE_ID} | Pathfinder 2e system required`);
    return;
  }

  console.log(`${MODULE_ID} | Milestone 6.2 ready`);
});
