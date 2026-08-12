import { MarketForgeAPI } from "./api/market-api.js";
import { MODULE_ID } from "./core/constants.js";
import { registerActorDirectoryIntegration } from "./integrations/actor-directory.js";
import { registerCharacterSheetIntegration } from "./integrations/character-sheet.js";
import { registerPartySheetIntegration } from "./integrations/party-sheet.js";
import { registerSettings } from "./settings/register-settings.js";
import { WorldMarketProfileService } from "./market/world-profile-service.js";
import { getMarketSocket } from "./socket/market-socket.js";
import { PF2eCapabilityService } from "./pf2e/capabilities.js";

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | initializing v0.1.0`);

  registerSettings();
  registerCharacterSheetIntegration();
  registerPartySheetIntegration();
  registerActorDirectoryIntegration();
  getMarketSocket().registerQueries();

  const module = game.modules.get(MODULE_ID);
  if (module) module.api = new MarketForgeAPI();
});

Hooks.once("ready", async () => {
  if (game.system.id !== "pf2e") {
    console.error(`${MODULE_ID} | Pathfinder 2e system required`);
    return;
  }

  const capability = new PF2eCapabilityService().checkGlobal();
  if (!capability.compatible) {
    console.error(`${MODULE_ID} | PF2e compatibility check failed`, capability);
    if (game.user?.isGM) ui.notifications?.error?.(game.i18n.localize("PF2E_MARKET_FORGE.Capability.Fatal"));
    return;
  }
  if (game.user?.isGM && capability.warnings.length) {
    console.warn(`${MODULE_ID} | PF2e capability warnings`, capability.warnings);
  }

  getMarketSocket().register();

  if (game.user?.isGM) {
    try {
      await new WorldMarketProfileService().persistFallbackIfNeeded();
    } catch (error) {
      console.warn(`${MODULE_ID} | Could not persist initial M7 market profile`, error);
    }
  }

  console.log(`${MODULE_ID} | v0.1.0 ready`);
});
