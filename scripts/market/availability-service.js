export function evaluateAvailability(entry, profile, { maximumItemLevel = null, sourceKind = "item" } = {}) {
  const reasons = [];

  if (!entry || typeof entry !== "object") {
    return { available: false, reasons: ["invalid-data"] };
  }

  if (maximumItemLevel !== null && entry.level > maximumItemLevel) reasons.push("level-too-high");
  if (!profile.availability?.rarities?.[entry.rarity]) reasons.push("rarity-not-allowed");

  const configuredSources = sourceKind === "spell"
    ? profile.sources?.spellCompendia
    : profile.sources?.itemCompendia;

  if (!Array.isArray(configuredSources) || !configuredSources.includes(entry.sourcePack)) {
    reasons.push("source-not-allowed");
  }

  return {
    available: reasons.length === 0,
    reasons,
    ...(maximumItemLevel === null ? {} : { marketMaximumLevel: maximumItemLevel })
  };
}
