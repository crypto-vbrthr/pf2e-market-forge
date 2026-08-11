import { MarketForgeAPI } from "./api/market-api.js";
import { MODULE_ID } from "./core/constants.js";

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | initializing Milestone 0`);

  const module = game.modules.get(MODULE_ID);
  if (module) module.api = new MarketForgeAPI();
});

Hooks.once("ready", () => {
  if (game.system.id !== "pf2e") {
    console.error(`${MODULE_ID} | Pathfinder 2e system required`);
    return;
  }

  console.log(`${MODULE_ID} | Milestone 0 ready`);
});
