import { evaluateAvailability } from "../market/availability-service.js";

const INDEX_FIELDS = Object.freeze([
  "type",
  "img",
  "system.level.value",
  "system.traits.rarity",
  "system.traits.value",
  "system.traits.traditions",
  "system.ritual",
  "system.cost.value",
  "system.slug"
]);

export class SpellCatalogService {
  #packProvider;
  #resolver;
  #indexCache = new Map();

  constructor({ packProvider, resolver } = {}) {
    this.#packProvider = packProvider ?? (() => globalThis.game?.packs ?? null);
    this.#resolver = resolver ?? ((uuid) => globalThis.fromUuid?.(uuid));
  }

  clearCache(packId = null) {
    if (packId) this.#indexCache.delete(packId);
    else this.#indexCache.clear();
  }

  async getEntry(uuid, { profile, fresh = false, availabilitySession = null } = {}) {
    if (typeof uuid !== "string" || !uuid) throw new TypeError("Spell catalog entry UUID is required.");
    if (!profile || typeof profile !== "object") throw new TypeError("Spell catalog lookup requires a MarketProfile.");

    const sources = Array.isArray(profile.sources?.spellCompendia) ? profile.sources.spellCompendia : [];
    for (const packId of sources) {
      const result = fresh ? await this.#loadPackUncached(packId) : await this.#loadPack(packId);
      const entry = result.entries.find((candidate) => candidate.uuid === uuid);
      if (!entry) continue;
      const providerAvailability = availabilitySession?.type === "city-forge"
        ? availabilitySession.evaluateEntry(entry, { sourceKind: "spell", level: null })
        : null;
      return {
        ...entry,
        availability: evaluateAvailability(
          { ...entry, level: 0 },
          profile,
          { maximumItemLevel: null, sourceKind: "spell", providerAvailability }
        )
      };
    }
    return null;
  }

  async getSpell(uuid) {
    const spell = await this.#resolver(uuid);
    return spell?.type === "spell" ? spell : null;
  }

  async search({ profile, filters = {}, limit = 150, availabilitySession = null } = {}) {
    if (!profile || typeof profile !== "object") throw new TypeError("Spell catalog search requires a MarketProfile.");
    if (!Number.isSafeInteger(limit) || limit < 1) throw new TypeError("Spell catalog result limit must be a positive integer.");

    const sources = Array.isArray(profile.sources?.spellCompendia) ? profile.sources.spellCompendia : [];
    const sourceResults = await Promise.all(sources.map((packId) => this.#loadPack(packId)));
    const allEntries = sourceResults.flatMap((result) => result.entries);
    const normalized = normalizeSpellFilters(filters);

    let filtered = allEntries
      .map((entry) => {
        const providerAvailability = availabilitySession?.type === "city-forge"
          ? availabilitySession.evaluateEntry(entry, { sourceKind: "spell", level: null })
          : null;
        return {
          ...entry,
          availability: evaluateAvailability(
            { ...entry, level: 0 },
            profile,
            { maximumItemLevel: null, sourceKind: "spell", providerAvailability }
          )
        };
      })
      .filter((entry) => profile.availability?.unavailableDisplay !== "hidden" || entry.availability.available)
      .filter((entry) => matchesSpellFilters(entry, normalized))
      .sort(compareSpellEntries);

    const total = filtered.length;
    const entries = filtered.slice(0, limit);
    return {
      entries,
      total,
      truncated: total > entries.length,
      facets: buildSpellFacets(allEntries, sources, sourceResults),
      sources: sourceResults.map(({ packId, label, status, error }) => ({ packId, label, status, error }))
    };
  }

  async #loadPack(packId) {
    if (this.#indexCache.has(packId)) return this.#indexCache.get(packId);
    const promise = this.#loadPackUncached(packId);
    this.#indexCache.set(packId, promise);
    try {
      return await promise;
    } catch (error) {
      this.#indexCache.delete(packId);
      throw error;
    }
  }

  async #loadPackUncached(packId) {
    const packs = this.#packProvider();
    const pack = packs?.get?.(packId) ?? null;
    if (!pack) return failedPack(packId, packId, "missing", `Compendium not found: ${packId}`);
    const label = pack.metadata?.label ?? pack.title ?? packId;
    if (pack.documentName && pack.documentName !== "Item") {
      return failedPack(packId, label, "unsupported", `Compendium ${packId} does not contain Item documents.`);
    }

    try {
      const index = await pack.getIndex({ fields: [...INDEX_FIELDS] });
      const rows = Array.from(index?.values?.() ?? index ?? []);
      const entries = rows.flatMap((row) => {
        const mapped = mapSpellIndexEntry(row, packId, pack);
        return mapped ? [mapped] : [];
      });
      return { packId, label, status: "ready", error: null, entries };
    } catch (error) {
      console.warn?.("pf2e-market-forge | Failed to index spell compendium", packId, error);
      return failedPack(packId, label, "error", error instanceof Error ? error.message : String(error));
    }
  }
}

export function mapSpellIndexEntry(row, packId, pack = null) {
  if (!row || typeof row !== "object" || String(readPath(row, "type")) !== "spell") return null;
  const baseRank = Number(readPath(row, "system.level.value"));
  if (!Number.isSafeInteger(baseRank) || baseRank < 1 || baseRank > 10) return null;

  const traits = arrayValue(readPath(row, "system.traits.value"));
  const traditions = arrayValue(readPath(row, "system.traits.traditions"));
  const ritual = readPath(row, "system.ritual");
  if (traits.includes("cantrip") || traits.includes("focus") || ritual) return null;

  const id = String(row._id ?? row.id ?? "");
  if (!id) return null;
  const collection = pack?.collection ?? packId;
  return {
    uuid: row.uuid ?? `Compendium.${collection}.Item.${id}`,
    name: String(row.name ?? ""),
    img: String(row.img ?? "icons/svg/book.svg"),
    baseRank,
    rarity: String(readPath(row, "system.traits.rarity") ?? "common"),
    traditions,
    traits,
    cost: String(readPath(row, "system.cost.value") ?? ""),
    sourcePack: packId,
    sourceLabel: pack?.metadata?.label ?? pack?.title ?? packId,
    slug: String(readPath(row, "system.slug") ?? "")
  };
}

export function normalizeSpellFilters(filters = {}) {
  return {
    search: normalizeSearchText(filters.search ?? ""),
    baseRank: filters.baseRank === "all" || filters.baseRank === "" || filters.baseRank === undefined
      ? "all"
      : Number(filters.baseRank),
    tradition: String(filters.tradition ?? "all"),
    rarity: String(filters.rarity ?? "all"),
    sourcePack: String(filters.sourcePack ?? "all")
  };
}

export function matchesSpellFilters(entry, filters) {
  if (filters.search) {
    const haystack = normalizeSearchText(`${entry.name} ${entry.slug ?? ""}`);
    if (!haystack.includes(filters.search)) return false;
  }
  if (filters.baseRank !== "all" && entry.baseRank !== filters.baseRank) return false;
  if (filters.tradition !== "all" && !entry.traditions.includes(filters.tradition)) return false;
  if (filters.rarity !== "all" && entry.rarity !== filters.rarity) return false;
  if (filters.sourcePack !== "all" && entry.sourcePack !== filters.sourcePack) return false;
  return true;
}

export function buildSpellFacets(entries, configuredSources = [], sourceResults = []) {
  const ranks = [...new Set(entries.map((entry) => entry.baseRank))].sort((a, b) => a - b);
  const traditions = [...new Set(entries.flatMap((entry) => entry.traditions))].sort();
  const rarities = [...new Set(entries.map((entry) => entry.rarity))].sort(compareRarity);
  const sourceLabels = new Map(sourceResults.map((source) => [source.packId, source.label]));
  const sources = configuredSources.map((id) => ({ id, label: sourceLabels.get(id) ?? id }));
  return { ranks, traditions, rarities, sources };
}

function failedPack(packId, label, status, error) {
  return { packId, label, status, error, entries: [] };
}

function readPath(object, path) {
  if (Object.prototype.hasOwnProperty.call(object, path)) return object[path];
  return path.split(".").reduce((value, key) => value?.[key], object);
}

function arrayValue(value) {
  if (value instanceof Set) return [...value];
  return Array.isArray(value) ? [...value] : [];
}

function normalizeSearchText(value) {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
}

function compareSpellEntries(a, b) {
  return a.baseRank - b.baseRank || a.name.localeCompare(b.name);
}

function compareRarity(a, b) {
  const order = ["common", "uncommon", "rare", "unique"];
  return (order.indexOf(a) - order.indexOf(b)) || a.localeCompare(b);
}
