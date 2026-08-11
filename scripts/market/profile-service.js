import { createDefaultMarketProfile } from "./profile-defaults.js";
import { validateMarketProfile } from "./profile-validator.js";

export class MarketProfileService {
  #profiles = new Map();

  constructor(profiles = [createDefaultMarketProfile()]) {
    for (const profile of profiles) this.setProfile(profile);
  }

  getProfiles() {
    return [...this.#profiles.values()].map((profile) => structuredClone(profile));
  }

  getProfile(id) {
    const profile = this.#profiles.get(id);
    return profile ? structuredClone(profile) : null;
  }

  setProfile(profile) {
    const validation = validateMarketProfile(profile);
    if (!validation.valid) {
      throw new Error(`Invalid MarketProfile: ${validation.errors.join(", ")}`);
    }
    this.#profiles.set(profile.id, structuredClone(profile));
    return this.getProfile(profile.id);
  }
}
