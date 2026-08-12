import { API_VERSION } from "../core/constants.js";
import { MarketLauncher } from "../launcher/market-launcher.js";
import { WorldMarketProfileService } from "../market/world-profile-service.js";
import { MarketDiagnosticsService } from "../diagnostics/market-diagnostics.js";

export class MarketForgeAPI {
  version = API_VERSION;
  #profiles = new WorldMarketProfileService();
  #launcher = new MarketLauncher({ profileService: this.#profiles });
  #diagnostics = new MarketDiagnosticsService({ profileService: this.#profiles });

  async open(options = {}) {
    return this.#launcher.open(options);
  }

  getProfiles() {
    return this.#profiles.getProfiles();
  }

  getProfile(id) {
    return this.#profiles.getProfile(id);
  }

  getDefaultProfile() {
    return this.#profiles.getDefaultProfile();
  }

  async diagnose(options = {}) {
    return this.#diagnostics.diagnose(options);
  }
}

