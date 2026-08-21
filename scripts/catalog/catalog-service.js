import { coinsToCopper } from "../core/money.js";
import { evaluateAvailability } from "../market/availability-service.js";

export const PHYSICAL_ITEM_TYPES = Object.freeze([
  "ammo",
  "armor",
  "backpack",
  "book",
  "consumable",
  "equipment",
  "shield",
  "treasure",
  "weapon"
]);

const PHYSICAL_ITEM_TYPE_SET = new Set(PHYSICAL_ITEM_TYPES);
const INDEX_FIELDS = Object.freeze([
  "type",
  "img",
  "system.level.value",
  "system.traits.rarity",
  "system.traits.value",
  "system.price.value",
  "system.price.per",
  "system.category",
  "system.slug"
]);

export class CatalogService {
  #packProvider;
  #indexCache = new Map();

  constructor({ packProvider } = {}) {
    this.#packProvider = packProvider ?? (() => globalThis.game?.packs ?? null);
  }

  clearCache(packId = null) {
    if (packId) this.#indexCache.delete(packId);
    else this.#indexCache.clear();
  }

  async getEntry(uuid, { profile, maximumItemLevel = null, fresh = false, availabilitySession = null } = {}) {
    if (typeof uuid !== "string" || !uuid) throw new TypeError("Catalog entry UUID is required.");
    if (!profile || typeof profile !== "object") throw new TypeError("Catalog lookup requires a MarketProfile.");

    const configuredSources = Array.isArray(profile.sources?.itemCompendia)
      ? profile.sources.itemCompendia
      : [];

    for (const packId of configuredSources) {
      const result = fresh ? await this.#loadPackUncached(packId) : await this.#loadPack(packId);
      const entry = result.entries.find((candidate) => candidate.uuid === uuid);
      if (!entry) continue;
      const providerAvailability = availabilitySession?.type === "city-forge"
        ? availabilitySession.evaluateEntry(entry, { sourceKind: "item" })
        : null;
      return {
        ...entry,
        availability: evaluateAvailability(entry, profile, {
          maximumItemLevel,
          sourceKind: "item",
          providerAvailability
        })
      };
    }

    return null;
  }

  async search({ profile, maximumItemLevel = null, filters = {}, limit = 150, availabilitySession = null } = {}) {
    if (!profile || typeof profile !== "object") throw new TypeError("Catalog search requires a MarketProfile.");
    if (!Number.isSafeInteger(limit) || limit < 1) throw new TypeError("Catalog result limit must be a positive integer.");

    const configuredSources = Array.isArray(profile.sources?.itemCompendia)
      ? profile.sources.itemCompendia
      : [];

    const sourceResults = await Promise.all(configuredSources.map((packId) => this.#loadPack(packId)));
    const allEntries = sourceResults.flatMap((result) => result.entries);
    const normalizedFilters = normalizeCatalogFilters(filters);

    let filtered = allEntries
      .map((entry) => {
        const providerAvailability = availabilitySession?.type === "city-forge"
          ? availabilitySession.evaluateEntry(entry, { sourceKind: "item" })
          : null;
        return {
          ...entry,
          availability: evaluateAvailability(entry, profile, {
            maximumItemLevel,
            sourceKind: "item",
            providerAvailability
          })
        };
      })
      .filter((entry) => profile.availability?.unavailableDisplay !== "hidden" || entry.availability.available)
      .filter((entry) => matchesFilters(entry, normalizedFilters));

    filtered = filtered.sort(compareCatalogEntries);

    const total = filtered.length;
    const entries = filtered.slice(0, limit);

    return {
      entries,
      total,
      truncated: total > entries.length,
      facets: buildCatalogFacets(allEntries, configuredSources, sourceResults),
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
    if (!pack) {
      return {
        packId,
        label: packId,
        status: "missing",
        error: `Compendium not found: ${packId}`,
        entries: []
      };
    }

    if (pack.documentName && pack.documentName !== "Item") {
      return {
        packId,
        label: pack.metadata?.label ?? pack.title ?? packId,
        status: "unsupported",
        error: `Compendium ${packId} does not contain Item documents.`,
        entries: []
      };
    }

    try {
      const index = await pack.getIndex({ fields: [...INDEX_FIELDS] });
      const rows = Array.from(index?.values?.() ?? index ?? []);
      const entries = rows.flatMap((row) => {
        const mapped = mapIndexEntry(row, packId, pack);
        return mapped ? [mapped] : [];
      });

      return {
        packId,
        label: pack.metadata?.label ?? pack.title ?? packId,
        status: "ready",
        error: null,
        entries
      };
    } catch (error) {
      console.warn?.("pf2e-market-forge | Failed to index market compendium", packId, error);
      return {
        packId,
        label: pack.metadata?.label ?? pack.title ?? packId,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
        entries: []
      };
    }
  }
}

export function mapIndexEntry(row, packId, pack = null) {
  if (!row || typeof row !== "object") return null;

  const type = String(readPath(row, "type") ?? "");
  if (!PHYSICAL_ITEM_TYPE_SET.has(type)) return null;

  const category = String(readPath(row, "system.category") ?? "");
  if (type === "treasure" && ["coin", "credstick"].includes(category)) return null;

  const level = Number(readPath(row, "system.level.value"));
  if (!Number.isFinite(level)) return null;

  const rarity = String(readPath(row, "system.traits.rarity") ?? "common");
  const priceValue = readPath(row, "system.price.value") ?? {};
  const pricePer = Math.max(1, Math.floor(Number(readPath(row, "system.price.per")) || 1));
  const stackPrice = rawCoinsToCopper(priceValue);
  const baseUnitPrice = Math.floor(stackPrice / pricePer);
  const id = String(row._id ?? row.id ?? "");
  if (!id) return null;

  const collection = pack?.collection ?? packId;
  const uuid = row.uuid ?? `Compendium.${collection}.Item.${id}`;
  const traits = readPath(row, "system.traits.value");

  return {
    uuid,
    name: String(row.name ?? ""),
    img: String(row.img ?? "icons/svg/item-bag.svg"),
    itemType: type,
    category: category || type,
    level: Math.trunc(level),
    rarity,
    traits: Array.isArray(traits) ? [...traits] : [],
    baseUnitPrice,
    pricePer,
    stackPrice,
    sourcePack: packId,
    sourceLabel: pack?.metadata?.label ?? pack?.title ?? packId,
    slug: String(readPath(row, "system.slug") ?? "")
  };
}

export function normalizeCatalogFilters(filters = {}) {
  return {
    search: normalizeSearchText(filters.search ?? ""),
    category: String(filters.category ?? "all"),
    level: filters.level === "all" || filters.level === "" || filters.level === undefined
      ? "all"
      : Number(filters.level),
    rarity: String(filters.rarity ?? "all"),
    sourcePack: String(filters.sourcePack ?? "all")
  };
}

export function matchesFilters(entry, filters) {
  if (filters.search) {
    const haystack = normalizeSearchText(`${entry.name} ${entry.slug ?? ""}`);
    if (!haystack.includes(filters.search)) return false;
  }

  if (filters.category !== "all" && entry.itemType !== filters.category && entry.category !== filters.category) {
    return false;
  }

  if (filters.level !== "all" && entry.level !== filters.level) return false;
  if (filters.rarity !== "all" && entry.rarity !== filters.rarity) return false;
  if (filters.sourcePack !== "all" && entry.sourcePack !== filters.sourcePack) return false;

  return true;
}

export function buildCatalogFacets(entries, configuredSources = [], sourceResults = []) {
  const categories = [...new Set(entries.map((entry) => entry.itemType))].sort();
  const levels = [...new Set(entries.map((entry) => entry.level))].sort((a, b) => a - b);
  const rarities = [...new Set(entries.map((entry) => entry.rarity))].sort(compareRarity);
  const sourceLabels = new Map(sourceResults.map((source) => [source.packId, source.label]));
  const sources = configuredSources.map((packId) => ({
    id: packId,
    label: sourceLabels.get(packId) ?? packId
  }));

  return { categories, levels, rarities, sources };
}

export function rawCoinsToCopper(value = {}) {
  return coinsToCopper({
    pp: safeCoin(value.pp),
    gp: safeCoin(value.gp),
    sp: safeCoin(value.sp),
    cp: safeCoin(value.cp)
  });
}

function safeCoin(value) {
  const number = Number(value ?? 0);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function readPath(object, path) {
  if (Object.prototype.hasOwnProperty.call(object, path)) return object[path];
  return path.split(".").reduce((value, key) => value?.[key], object);
}

function normalizeSearchText(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}

function compareCatalogEntries(a, b) {
  return a.level - b.level || a.name.localeCompare(b.name);
}

function compareRarity(a, b) {
  const order = ["common", "uncommon", "rare", "unique"];
  return (order.indexOf(a) - order.indexOf(b)) || a.localeCompare(b);
}
