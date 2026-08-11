export function createSpellViewState(overrides = {}) {
  return {
    search: "",
    baseRank: "all",
    tradition: "all",
    rarity: "all",
    sourcePack: "all",
    selectedSpellUuid: null,
    kind: "scroll",
    castRank: null,
    quantity: 1,
    ...structuredClone(overrides)
  };
}

export function updateSpellViewState(state, field, value) {
  const next = createSpellViewState(state);
  if (!["search", "baseRank", "tradition", "rarity", "sourcePack", "selectedSpellUuid", "kind", "castRank", "quantity"].includes(field)) {
    throw new TypeError(`Unknown spell view field: ${field}`);
  }
  if (["castRank", "quantity"].includes(field)) next[field] = value === null || value === "" ? null : Number(value);
  else next[field] = value;
  return next;
}
