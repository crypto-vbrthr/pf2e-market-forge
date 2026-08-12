import { API_VERSION } from "../core/constants.js";
import { MarketLauncher } from "../launcher/market-launcher.js";
import { MarketProfileService } from "../market/profile-service.js";
import { createConfiguredMarketProfile } from "../market/profile-settings.js";

export class MarketForgeAPI {
  version = API_VERSION;
  #profiles = new MarketProfileService();
  #launcher = new MarketLauncher({ profileService: this.#profiles });

  async open(options = {}) {
    return this.#launcher.open(options);
  }

  getProfiles() {
    const profiles = this.#profiles.getProfiles().filter((profile) => profile.id !== "default");
    return [createConfiguredMarketProfile(), ...profiles];
  }

  getProfile(id) {
    if (id === "default") return createConfiguredMarketProfile();
    return this.#profiles.getProfile(id);
  }

  async quotePurchase() {
    throw new Error("PF2E Market Forge: public purchase quoting is not exposed yet.");
  }

  async quoteSale() {
    throw new Error("PF2E Market Forge: public sale quoting is not exposed yet.");
  }
}
