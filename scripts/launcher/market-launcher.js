import { MODULE_ID } from "../core/constants.js";

export class MarketLauncher {
  async open(options = {}) {
    if (globalThis.game?.system?.id !== "pf2e") {
      globalThis.ui?.notifications?.error?.("PF2E Market Forge can only be used with the Pathfinder 2e system.");
      return false;
    }

    console.debug(`${MODULE_ID} | launcher invoked`, options);
    globalThis.ui?.notifications?.info?.(
      globalThis.game?.i18n?.localize?.("PF2E_MARKET_FORGE.Milestone0") ??
      "Market Forge Milestone 0 is active."
    );
    return true;
  }
}
