import {
  LEVEL_LIMIT_MODES,
  LEVEL_ROUNDING,
  PROFILE_SCHEMA_VERSION,
  RARITIES
} from "../core/constants.js";

export function validateMarketProfile(profile) {
  const errors = [];

  if (!profile || typeof profile !== "object") return { valid: false, errors: ["profile-not-object"] };
  if (profile.schemaVersion !== PROFILE_SCHEMA_VERSION) errors.push("unsupported-schema-version");
  if (typeof profile.id !== "string" || !profile.id.trim()) errors.push("invalid-id");
  if (typeof profile.name !== "string" || !profile.name.trim()) errors.push("invalid-name");

  const itemCompendia = profile.sources?.itemCompendia;
  const spellCompendia = profile.sources?.spellCompendia;
  if (!isStringArray(itemCompendia)) errors.push("invalid-item-compendia");
  if (!isStringArray(spellCompendia)) errors.push("invalid-spell-compendia");

  const limit = profile.availability?.levelLimit;
  if (!LEVEL_LIMIT_MODES.includes(limit?.mode)) errors.push("invalid-level-mode");
  if (!LEVEL_ROUNDING.includes(limit?.rounding)) errors.push("invalid-level-rounding");
  if (!Number.isSafeInteger(limit?.offset)) errors.push("invalid-level-offset");
  if (limit?.mode === "fixed" && (!Number.isSafeInteger(limit.fixedLevel) || limit.fixedLevel < 0)) {
    errors.push("invalid-fixed-level");
  }

  for (const rarity of RARITIES) {
    if (typeof profile.availability?.rarities?.[rarity] !== "boolean") {
      errors.push(`invalid-rarity-${rarity}`);
    }
  }

  if (!["hidden", "disabled"].includes(profile.availability?.unavailableDisplay)) {
    errors.push("invalid-unavailable-display");
  }

  if (!isNonNegativeFinite(profile.pricing?.buyMultiplier)) errors.push("invalid-buy-multiplier");
  if (!isNonNegativeFinite(profile.pricing?.sellMultiplier)) errors.push("invalid-sell-multiplier");

  for (const key of ["artObjects", "gems", "materials"]) {
    if (typeof profile.pricing?.fullValueTreasure?.[key] !== "boolean") {
      errors.push(`invalid-full-value-${key}`);
    }
  }

  if (typeof profile.spellItems?.scrolls !== "boolean") errors.push("invalid-scroll-setting");
  if (typeof profile.spellItems?.wands !== "boolean") errors.push("invalid-wand-setting");

  return { valid: errors.length === 0, errors };
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string" && entry.length > 0);
}

function isNonNegativeFinite(value) {
  return Number.isFinite(value) && value >= 0;
}
