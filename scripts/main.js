import { MarketForgeAPI } from "./api/market-api.js";
import { MODULE_ID } from "./core/constants.js";
import { registerActorDirectoryIntegration } from "./integrations/actor-directory.js";
import { registerCharacterSheetIntegration } from "./integrations/character-sheet.js";
import { registerPartySheetIntegration } from "./integrations/party-sheet.js";
import { registerSettings } from "./settings/register-settings.js";
import { WorldMarketProfileService } from "./market/world-profile-service.js";

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | initializing Milestone 7.2`);

  registerSettings();
  registerCharacterSheetIntegration();
  registerPartySheetIntegration();
  registerActorDirectoryIntegration();

  const module = game.modules.get(MODULE_ID);
  if (module) module.api = new MarketForgeAPI();
});

Hooks.once("ready", async () => {
  if (game.system.id !== "pf2e") {
    console.error(`${MODULE_ID} | Pathfinder 2e system required`);
    return;
  }

  if (game.user?.isGM) {
    try {
      await new WorldMarketProfileService().persistFallbackIfNeeded();
    } catch (error) {
      console.warn(`${MODULE_ID} | Could not persist initial M7 market profile`, error);
    }
  }

  console.log(`${MODULE_ID} | Milestone 7.2 ready`);
});
