import { PROFILE_SCHEMA_VERSION } from "../core/constants.js";

export function createDefaultMarketProfile(overrides = {}) {
  const base = {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    id: "default",
    name: "Default Market",
    sources: {
      itemCompendia: ["pf2e.equipment-srd"],
      spellCompendia: ["pf2e.spells-srd"]
    },
    availability: {
      provider: {
        type: "manual",
        sourceId: ""
      },
      levelLimit: {
        mode: "party-average",
        offset: 0,
        rounding: "floor"
      },
      rarities: {
        common: true,
        uncommon: false,
        rare: false,
        unique: false
      },
      unavailableDisplay: "disabled"
    },
    pricing: {
      buyMultiplier: 1,
      sellMultiplier: 0.5,
      fullValueTreasure: {
        artObjects: true,
        gems: true,
        materials: true
      }
    },
    spellItems: {
      scrolls: true,
      wands: true
    }
  };

  return deepMerge(base, overrides);
}

function deepMerge(base, override) {
  if (!override || typeof override !== "object" || Array.isArray(override)) return override ?? base;
  const result = structuredClone(base);
  for (const [key, value] of Object.entries(override)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      result[key] &&
      typeof result[key] === "object" &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(result[key], value);
    } else {
      result[key] = structuredClone(value);
    }
  }
  return result;
}
