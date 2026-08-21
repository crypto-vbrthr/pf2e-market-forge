import { MODULE_ID } from "../core/constants.js";
import { getSetting } from "../settings/get-setting.js";
import { SETTINGS } from "../settings/keys.js";
import { createDefaultMarketProfile } from "./profile-defaults.js";
import { createConfiguredMarketProfile } from "./profile-settings.js";
import { validateMarketProfile } from "./profile-validator.js";

export const PROFILE_STORAGE_VERSION = 1;

export class WorldMarketProfileService {
  #getter;
  #setter;
  #legacyGetter;

  constructor({ getter = getSetting, setter = defaultSetter, legacyGetter = getSetting } = {}) {
    this.#getter = getter;
    this.#setter = setter;
    this.#legacyGetter = legacyGetter;
  }

  getProfiles() {
    return readStoredProfiles(this.#getter, this.#legacyGetter);
  }

  getProfile(id) {
    const profile = this.getProfiles().find((entry) => entry.id === id);
    return profile ? structuredClone(profile) : null;
  }

  getDefaultProfileId() {
    const profiles = this.getProfiles();
    const requested = String(this.#getter(SETTINGS.DEFAULT_PROFILE_ID, "default") ?? "default");
    return profiles.some((profile) => profile.id === requested) ? requested : profiles[0]?.id ?? "default";
  }

  getDefaultProfile() {
    return this.getProfile(this.getDefaultProfileId()) ?? structuredClone(this.getProfiles()[0]);
  }

  async saveProfile(profile) {
    assertValidProfile(profile);
    const profiles = this.getProfiles();
    const index = profiles.findIndex((entry) => entry.id === profile.id);
    if (index >= 0) profiles[index] = structuredClone(profile);
    else profiles.push(structuredClone(profile));
    await this.#writeProfiles(profiles);
    return this.getProfile(profile.id);
  }

  async deleteProfile(id) {
    const profiles = this.getProfiles();
    if (profiles.length <= 1) throw new Error("PF2E Market Forge requires at least one market profile.");
    const filtered = profiles.filter((profile) => profile.id !== id);
    if (filtered.length === profiles.length) return false;
    const deletingDefault = this.getDefaultProfileId() === id;

    await this.#writeProfiles(filtered);
    if (deletingDefault) await this.setDefaultProfileId(filtered[0].id);
    return true;
  }

  async setDefaultProfileId(id) {
    if (!this.getProfiles().some((profile) => profile.id === id)) {
      throw new RangeError(`Market profile not found: ${id}`);
    }
    await this.#setter(SETTINGS.DEFAULT_PROFILE_ID, id);
    return id;
  }

  async persistFallbackIfNeeded() {
    const raw = this.#getter(SETTINGS.MARKET_PROFILES, "");
    if (typeof raw === "string" && raw.trim()) return false;
    const profiles = this.getProfiles();
    const initial = profiles.find((profile) => profile.id === "default");
    const localizedDefault = globalThis.game?.i18n?.localize?.("PF2E_MARKET_FORGE.DefaultMarket");
    if (initial?.name === "Default Market" && localizedDefault && localizedDefault !== "PF2E_MARKET_FORGE.DefaultMarket") {
      initial.name = localizedDefault;
    }
    await this.#writeProfiles(profiles);
    await this.#setter(SETTINGS.DEFAULT_PROFILE_ID, profiles[0]?.id ?? "default");
    return true;
  }

  createProfile({ name = "New Market", cloneFrom = null, id = null } = {}) {
    const source = cloneFrom
      ? structuredClone(cloneFrom)
      : structuredClone(this.getDefaultProfile() ?? createDefaultMarketProfile());
    source.id = id ?? createProfileId(name, this.getProfiles().map((profile) => profile.id));
    source.name = String(name || "New Market").trim() || "New Market";
    return source;
  }

  async #writeProfiles(profiles) {
    const normalized = normalizeProfiles(profiles);
    await this.#setter(SETTINGS.MARKET_PROFILES, serializeProfiles(normalized));
  }
}

export function readStoredProfiles(getter = getSetting, legacyGetter = getter) {
  const raw = getter(SETTINGS.MARKET_PROFILES, "");
  const parsed = parseProfiles(raw);
  if (parsed.length > 0) return parsed;

  // First M7 load: preserve the M6.x level settings in the initial persisted profile.
  return [createConfiguredMarketProfile({}, legacyGetter)];
}

export function serializeProfiles(profiles) {
  const normalized = normalizeProfiles(profiles);
  return JSON.stringify({ version: PROFILE_STORAGE_VERSION, profiles: normalized });
}

export function parseProfiles(raw) {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    const candidates = Array.isArray(parsed) ? parsed : parsed?.profiles;
    if (!Array.isArray(candidates)) return [];
    return normalizeProfiles(candidates, { tolerateInvalid: true });
  } catch (_error) {
    return [];
  }
}

export function normalizeProfiles(profiles, { tolerateInvalid = false } = {}) {
  if (!Array.isArray(profiles)) return [];
  const seen = new Set();
  const result = [];
  for (const candidate of profiles) {
    const canonical = canonicalizeMarketProfile(candidate);
    const validation = validateMarketProfile(canonical);
    if (!validation.valid) {
      if (tolerateInvalid) continue;
      throw new Error(`Invalid MarketProfile: ${validation.errors.join(", ")}`);
    }
    if (seen.has(canonical.id)) {
      if (tolerateInvalid) continue;
      throw new Error(`Duplicate MarketProfile id: ${canonical.id}`);
    }
    seen.add(canonical.id);
    result.push(canonical);
  }
  if (!tolerateInvalid && result.length === 0) throw new Error("At least one MarketProfile is required.");
  return result;
}

function canonicalizeMarketProfile(profile) {
  const canonical = structuredClone(profile);
  canonical.availability ??= {};
  canonical.availability.provider = normalizeAvailabilityProviderConfig(canonical.availability.provider);
  // M0-M7 carried transaction switches which were never implemented as real
  // profile behavior. Revalidation and complete transactions are hard
  // invariants; mixed payment sources remain intentionally inactive.
  delete canonical.transaction;
  return canonical;
}

export function createProfileId(name, existingIds = []) {
  const existing = new Set(existingIds);
  const slug = String(name ?? "market")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "market";
  let id = slug;
  let suffix = 2;
  while (existing.has(id)) id = `${slug}-${suffix++}`;
  return id;
}

function assertValidProfile(profile) {
  const validation = validateMarketProfile(profile);
  if (!validation.valid) throw new Error(`Invalid MarketProfile: ${validation.errors.join(", ")}`);
}

function normalizeAvailabilityProviderConfig(value) {
  if (value?.type === "city-forge") {
    return {
      type: "city-forge",
      sourceId: typeof value.sourceId === "string" ? value.sourceId : ""
    };
  }
  return { type: "manual", sourceId: "" };
}

async function defaultSetter(key, value) {
  return globalThis.game?.settings?.set?.(MODULE_ID, key, value);
}
