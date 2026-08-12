import { MODULE_ID } from "../core/constants.js";
import { discoverItemCompendia, prepareCompendiumChoices } from "../settings/compendium-sources.js";
import { createDefaultMarketProfile } from "../market/profile-defaults.js";
import { validateMarketProfile } from "../market/profile-validator.js";
import { WorldMarketProfileService } from "../market/world-profile-service.js";
import { getMarketSocket } from "../socket/market-socket.js";

const api = globalThis.foundry?.applications?.api ?? {};
const BaseApplicationV2 = api.ApplicationV2 ?? class {};
const withHandlebars = api.HandlebarsApplicationMixin ?? ((Base) => Base);

export class MarketProfilesApplication extends withHandlebars(BaseApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-profiles`,
    classes: [MODULE_ID, "market-forge-profiles-window"],
    position: { width: 1040, height: 760 },
    window: {
      icon: "fa-solid fa-shop",
      resizable: true,
      title: "PF2E_MARKET_FORGE.Profiles.Title"
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/market-profiles.hbs` }
  };

  #service;
  #selectedId = null;
  #draft = null;
  #dirty = false;

  constructor({ profileService = null } = {}) {
    super();
    this.#service = profileService ?? new WorldMarketProfileService();
  }

  async _prepareContext(options) {
    const context = await super._prepareContext?.(options) ?? {};
    const profiles = this.#service.getProfiles();
    const defaultId = this.#service.getDefaultProfileId();
    const hasTransientDraft = Boolean(this.#draft && this.#selectedId === this.#draft.id);
    if (!this.#selectedId || (!profiles.some((profile) => profile.id === this.#selectedId) && !hasTransientDraft)) {
      this.#selectedId = defaultId ?? profiles[0]?.id ?? null;
      this.#draft = null;
      this.#dirty = false;
    }

    const persisted = profiles.find((profile) => profile.id === this.#selectedId) ?? profiles[0] ?? createDefaultMarketProfile();
    if (!this.#draft) this.#draft = structuredClone(persisted);
    const draft = this.#draft;
    const displayProfiles = profiles.some((profile) => profile.id === draft.id) ? profiles : [...profiles, draft];
    const packs = discoverItemCompendia();
    const validation = validateMarketProfile(draft);

    return Object.assign(context, {
      profiles: displayProfiles.map((profile) => ({
        id: profile.id,
        name: profile.name,
        selected: profile.id === draft.id,
        isDefault: profile.id === defaultId
      })),
      draft: {
        ...structuredClone(draft),
        isDefault: draft.id === defaultId,
        fixedMode: draft.availability?.levelLimit?.mode === "fixed",
        buyPercent: Math.round(Number(draft.pricing?.buyMultiplier ?? 1) * 100),
        sellPercent: Math.round(Number(draft.pricing?.sellMultiplier ?? 0.5) * 100)
      },
      itemCompendia: prepareCompendiumChoices(packs, draft.sources?.itemCompendia),
      spellCompendia: prepareCompendiumChoices(packs, draft.sources?.spellCompendia),
      levelModeOptions: choiceOptions(
        ["party-average", "party-highest", "party-lowest", "fixed", "unlimited"],
        draft.availability?.levelLimit?.mode,
        (value) => localize(`PF2E_MARKET_FORGE.LevelMode.${value}`, value)
      ),
      roundingOptions: choiceOptions(
        ["floor", "round", "ceil"],
        draft.availability?.levelLimit?.rounding,
        (value) => localize(`PF2E_MARKET_FORGE.Rounding.${value}`, value)
      ),
      unavailableOptions: choiceOptions(
        ["disabled", "hidden"],
        draft.availability?.unavailableDisplay,
        (value) => localize(
          value === "disabled" ? "PF2E_MARKET_FORGE.Profiles.ShowDisabled" : "PF2E_MARKET_FORGE.Profiles.HideUnavailable",
          value
        )
      ),
      dirty: this.#dirty,
      valid: validation.valid,
      validationErrors: validation.errors,
      canDelete: profiles.length > 1 || !profiles.some((profile) => profile.id === draft.id)
    });
  }

  async _onRender(context, options) {
    await super._onRender?.(context, options);
    const root = this.element;
    if (!root) return;

    root.querySelector("[data-profile-select]")?.addEventListener("change", (event) => {
      this.#selectProfile(event.currentTarget.value);
    });

    for (const input of root.querySelectorAll("[data-profile-field]")) {
      input.addEventListener("change", (event) => {
        this.#updateField(event.currentTarget.dataset.profileField, readInputValue(event.currentTarget));
      });
    }

    for (const input of root.querySelectorAll("[data-profile-source]")) {
      input.addEventListener("change", (event) => {
        const kind = event.currentTarget.dataset.profileSource;
        const packId = event.currentTarget.value;
        this.#toggleSource(kind, packId, event.currentTarget.checked);
      });
    }

    root.querySelector("[data-profile-new]")?.addEventListener("click", () => this.#newProfile());
    root.querySelector("[data-profile-duplicate]")?.addEventListener("click", () => this.#duplicateProfile());
    root.querySelector("[data-profile-delete]")?.addEventListener("click", () => this.#deleteProfile());
    root.querySelector("[data-profile-default]")?.addEventListener("click", () => this.#setDefault());
    root.querySelector("[data-profile-save]")?.addEventListener("click", () => this.#save());
    root.querySelector("[data-profile-reset]")?.addEventListener("click", () => this.#resetDraft());
  }

  #selectProfile(id) {
    const profile = this.#service.getProfile(id);
    if (!profile) return;
    this.#selectedId = id;
    this.#draft = structuredClone(profile);
    this.#dirty = false;
    this.render();
  }

  #updateField(path, value) {
    if (!this.#draft) return;
    setPath(this.#draft, path, normalizeFieldValue(path, value));
    this.#dirty = true;
    if (path === "availability.levelLimit.mode") this.render();
  }

  #toggleSource(kind, packId, checked) {
    if (!this.#draft || !["itemCompendia", "spellCompendia"].includes(kind)) return;
    const values = new Set(this.#draft.sources?.[kind] ?? []);
    if (checked) values.add(packId);
    else values.delete(packId);
    this.#draft.sources[kind] = [...values];
    this.#dirty = true;
  }

  #newProfile() {
    const profile = this.#service.createProfile({ name: localize("PF2E_MARKET_FORGE.Profiles.NewName", "New Market") });
    this.#selectedId = profile.id;
    this.#draft = profile;
    this.#dirty = true;
    this.render();
  }

  #duplicateProfile() {
    if (!this.#draft) return;
    const name = `${this.#draft.name} ${localize("PF2E_MARKET_FORGE.Profiles.CopySuffix", "Copy")}`;
    const profile = this.#service.createProfile({ name, cloneFrom: this.#draft });
    this.#selectedId = profile.id;
    this.#draft = profile;
    this.#dirty = true;
    this.render();
  }

  async #deleteProfile() {
    if (!this.#draft) return;
    const deletedProfileId = this.#draft.id;
    try {
      const persisted = this.#service.getProfile(deletedProfileId);
      const deleted = persisted ? await this.#service.deleteProfile(deletedProfileId) : true;
      if (!deleted) return;
      const next = this.#service.getDefaultProfile() ?? this.#service.getProfiles()[0];
      this.#selectedId = next?.id ?? null;
      this.#draft = next ? structuredClone(next) : null;
      this.#dirty = false;
      notify("info", "PF2E_MARKET_FORGE.Profiles.Deleted");
      globalThis.Hooks?.callAll?.(`${MODULE_ID}.profilesChanged`, deletedProfileId);
      getMarketSocket().broadcastProfilesChanged(deletedProfileId);
      this.render();
    } catch (error) {
      console.error(`${MODULE_ID} | Could not delete market profile`, error);
      notify("error", "PF2E_MARKET_FORGE.Profiles.DeleteFailed");
    }
  }

  async #setDefault() {
    if (!this.#draft) return;
    try {
      if (this.#dirty) await this.#save({ rerender: false });
      await this.#service.setDefaultProfileId(this.#draft.id);
      notify("info", "PF2E_MARKET_FORGE.Profiles.DefaultSet");
      globalThis.Hooks?.callAll?.(`${MODULE_ID}.profilesChanged`, this.#draft.id);
      getMarketSocket().broadcastProfilesChanged(this.#draft.id);
      this.render();
    } catch (error) {
      console.error(`${MODULE_ID} | Could not set default market profile`, error);
      notify("error", "PF2E_MARKET_FORGE.Profiles.SaveFailed");
    }
  }

  async #save({ rerender = true } = {}) {
    if (!this.#draft) return false;
    const normalized = normalizeEditableProfile(this.#draft);
    const validation = validateMarketProfile(normalized);
    if (!validation.valid) {
      globalThis.ui?.notifications?.error?.(`${localize("PF2E_MARKET_FORGE.Profiles.Invalid", "Invalid market profile")}: ${validation.errors.join(", ")}`);
      return false;
    }

    try {
      await this.#service.saveProfile(normalized);
      this.#selectedId = normalized.id;
      this.#draft = structuredClone(normalized);
      this.#dirty = false;
      notify("info", "PF2E_MARKET_FORGE.Profiles.Saved");
      globalThis.Hooks?.callAll?.(`${MODULE_ID}.profilesChanged`, normalized.id);
      getMarketSocket().broadcastProfilesChanged(normalized.id);
      if (rerender) this.render();
      return true;
    } catch (error) {
      console.error(`${MODULE_ID} | Could not save market profile`, error);
      notify("error", "PF2E_MARKET_FORGE.Profiles.SaveFailed");
      return false;
    }
  }

  #resetDraft() {
    const profile = this.#service.getProfile(this.#selectedId);
    if (!profile) return;
    this.#draft = structuredClone(profile);
    this.#dirty = false;
    this.render();
  }
}

export function normalizeEditableProfile(profile) {
  const result = structuredClone(profile);
  result.name = String(result.name ?? "").trim();
  result.availability.levelLimit.fixedLevel = clampInteger(result.availability.levelLimit.fixedLevel, 0, 30, 0);
  result.availability.levelLimit.offset = clampInteger(result.availability.levelLimit.offset, -20, 20, 0);
  result.pricing.buyMultiplier = Math.max(0, Number(result.pricing.buyMultiplier) || 0);
  result.pricing.sellMultiplier = Math.max(0, Number(result.pricing.sellMultiplier) || 0);
  result.sources.itemCompendia = uniqueStrings(result.sources.itemCompendia);
  result.sources.spellCompendia = uniqueStrings(result.sources.spellCompendia);
  return result;
}

function normalizeFieldValue(path, value) {
  if (["availability.levelLimit.fixedLevel", "availability.levelLimit.offset"].includes(path)) return Number(value);
  if (path === "pricing.buyPercent") return undefined;
  if (path === "pricing.sellPercent") return undefined;
  if (path === "pricing.buyMultiplier") return Math.max(0, Number(value) / 100);
  if (path === "pricing.sellMultiplier") return Math.max(0, Number(value) / 100);
  return value;
}

function readInputValue(input) {
  if (input.type === "checkbox") return Boolean(input.checked);
  if (input.type === "number" || input.type === "range") return Number(input.value);
  return input.value;
}

function setPath(target, path, value) {
  const parts = String(path).split(".");
  let current = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    current[parts[i]] ??= {};
    current = current[parts[i]];
  }
  current[parts.at(-1)] = value;
}

function clampInteger(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(numeric)));
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((entry) => typeof entry === "string" && entry))];
}

function choiceOptions(values, selected, labeler) {
  return values.map((value) => ({ value, selected: value === selected, label: labeler(value) }));
}

function localize(key, fallback) {
  const localized = globalThis.game?.i18n?.localize?.(key);
  return localized && localized !== key ? localized : fallback;
}

function notify(level, key) {
  const message = localize(key, key);
  globalThis.ui?.notifications?.[level]?.(message);
}
