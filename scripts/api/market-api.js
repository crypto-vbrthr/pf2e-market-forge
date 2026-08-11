import { API_VERSION } from "../core/constants.js";
import { MarketLauncher } from "../launcher/market-launcher.js";

export class MarketForgeAPI {
  version = API_VERSION;
  #launcher = new MarketLauncher();

  async open(options = {}) {
    return this.#launcher.open(options);
  }

  getProfiles() {
    return [];
  }

  getProfile() {
    return null;
  }

  async quotePurchase() {
    throw new Error("PF2E Market Forge Milestone 0: public purchase quoting is not wired to Foundry yet.");
  }

  async quoteSale() {
    throw new Error("PF2E Market Forge Milestone 0: public sale quoting is not wired to Foundry yet.");
  }
}
