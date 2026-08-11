export function createCatalogViewState(overrides = {}) {
  return {
    search: String(overrides.search ?? ""),
    category: String(overrides.category ?? "all"),
    level: normalizeSelectValue(overrides.level),
    rarity: String(overrides.rarity ?? "all"),
    sourcePack: String(overrides.sourcePack ?? "all")
  };
}

export function updateCatalogViewState(state, field, value) {
  if (!state || typeof state !== "object") throw new TypeError("Catalog view state is required.");
  if (!["search", "category", "level", "rarity", "sourcePack"].includes(field)) {
    throw new TypeError(`Unsupported catalog filter: ${field}`);
  }

  const next = { ...state };
  next[field] = field === "level" ? normalizeSelectValue(value) : String(value ?? "");
  return next;
}

export function toggleExpandedUuid(expanded, uuid) {
  const result = new Set(expanded ?? []);
  if (result.has(uuid)) result.delete(uuid);
  else result.add(uuid);
  return result;
}

function normalizeSelectValue(value) {
  if (value === undefined || value === null || value === "") return "all";
  return String(value);
}
