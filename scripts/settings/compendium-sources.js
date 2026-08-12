export function discoverItemCompendia(packs = globalThis.game?.packs ?? null) {
  const values = Array.from(packs?.values?.() ?? packs ?? []);
  return values
    .filter((pack) => !pack?.documentName || pack.documentName === "Item")
    .map((pack) => ({
      id: String(pack.collection ?? pack.metadata?.id ?? ""),
      label: String(pack.metadata?.label ?? pack.title ?? pack.collection ?? ""),
      packageName: String(pack.metadata?.packageName ?? pack.metadata?.package ?? ""),
      packageType: String(pack.metadata?.packageType ?? pack.metadata?.package ?? "")
    }))
    .filter((entry) => entry.id)
    .sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
}

export function prepareCompendiumChoices(compendia, selectedIds = []) {
  const selected = new Set(selectedIds);
  return compendia.map((entry) => ({ ...entry, selected: selected.has(entry.id) }));
}
