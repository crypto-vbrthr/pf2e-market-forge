import { isCityForgeAvailability } from "../integrations/city-forge-provider.js";

export function evaluateAvailability(
  entry,
  profile,
  {
    maximumItemLevel = null,
    sourceKind = "item",
    providerAvailability = null
  } = {}
) {
  const reasons = [];

  if (!entry || typeof entry !== "object") {
    return { available: false, reasons: ["invalid-data"] };
  }

  const cityForgeMode = isCityForgeAvailability(profile);

  if (cityForgeMode) {
    applyCityForgeAvailability(reasons, providerAvailability);
  } else {
    if (maximumItemLevel !== null && entry.level > maximumItemLevel) reasons.push("level-too-high");
    if (!profile.availability?.rarities?.[entry.rarity]) reasons.push("rarity-not-allowed");
  }

  if (sourceKind === "item" && Object.prototype.hasOwnProperty.call(entry, "baseUnitPrice")) {
    const marketPrice = Number.isSafeInteger(entry.stackPrice) ? entry.stackPrice : entry.baseUnitPrice;
    if (!Number.isSafeInteger(marketPrice) || marketPrice < 1) reasons.push("no-market-price");
  }

  const configuredSources = sourceKind === "spell"
    ? profile.sources?.spellCompendia
    : profile.sources?.itemCompendia;

  if (!Array.isArray(configuredSources) || !configuredSources.includes(entry.sourcePack)) {
    reasons.push("source-not-allowed");
  }

  const evaluation = providerAvailability?.evaluation ?? null;
  const citySource = providerAvailability?.source ?? null;

  return {
    available: reasons.length === 0,
    reasons,
    ...(cityForgeMode
      ? {
          marketMaximumLevel: evaluation?.maximumLevel ?? null,
          providerPriceMultiplier: normalizeProviderMultiplier(evaluation?.priceMultiplier),
          provider: {
            type: "city-forge",
            connected: providerAvailability?.connected === true,
            sourceId: citySource?.id ?? null,
            settlementId: citySource?.settlementId ?? null,
            settlementName: citySource?.settlementName ?? null,
            marketId: citySource?.marketId ?? null,
            marketLabel: citySource?.marketLabel ?? null
          }
        }
      : maximumItemLevel === null
        ? {}
        : { marketMaximumLevel: maximumItemLevel })
  };
}

function applyCityForgeAvailability(reasons, providerAvailability) {
  if (!providerAvailability?.connected) {
    reasons.push(providerAvailability?.reason || "city-forge-unavailable");
    return;
  }

  const evaluation = providerAvailability.evaluation;
  if (!evaluation || typeof evaluation !== "object") {
    reasons.push("city-forge-provider-error");
    return;
  }

  if (evaluation.levelAvailable === false) reasons.push("city-forge-level-too-high");

  if (evaluation.availability === "restricted") {
    reasons.push("city-forge-restricted");
  } else if (evaluation.availability !== "available") {
    reasons.push("city-forge-not-available");
  }
}

function normalizeProviderMultiplier(value) {
  const number = Number(value ?? 1);
  return Number.isFinite(number) && number >= 0 ? number : 1;
}
