import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAvailability } from "../scripts/market/availability-service.js";
import { createDefaultMarketProfile } from "../scripts/market/profile-defaults.js";

function profile() {
  return createDefaultMarketProfile({
    availability: {
      provider: { type: "city-forge", sourceId: "settlement-1::default" },
      levelLimit: { mode: "fixed", fixedLevel: 1, offset: 0, rounding: "floor" },
      rarities: { common: true, uncommon: false, rare: false, unique: false }
    }
  });
}

const entry = {
  level: 8,
  rarity: "uncommon",
  sourcePack: "pf2e.equipment-srd",
  baseUnitPrice: 100
};

test("City Forge live evaluation replaces manual level and rarity gates", () => {
  const availability = evaluateAvailability(entry, profile(), {
    maximumItemLevel: 1,
    sourceKind: "item",
    providerAvailability: {
      connected: true,
      source: {
        id: "settlement-1::default",
        settlementId: "settlement-1",
        settlementName: "Ostwall",
        marketId: "default",
        marketLabel: "Allgemeiner Markt"
      },
      evaluation: {
        maximumLevel: 8,
        levelAvailable: true,
        availability: "available",
        priceMultiplier: 1.2
      }
    }
  });

  assert.equal(availability.available, true);
  assert.equal(availability.marketMaximumLevel, 8);
  assert.equal(availability.providerPriceMultiplier, 1.2);
  assert.equal(availability.reasons.includes("level-too-high"), false);
  assert.equal(availability.reasons.includes("rarity-not-allowed"), false);
});

test("City Forge restricted access remains unavailable until an access rule grants it", () => {
  const availability = evaluateAvailability(entry, profile(), {
    sourceKind: "item",
    providerAvailability: {
      connected: true,
      source: { id: "settlement-1::default" },
      evaluation: {
        maximumLevel: 8,
        levelAvailable: true,
        availability: "restricted",
        priceMultiplier: 1
      }
    }
  });
  assert.equal(availability.available, false);
  assert.ok(availability.reasons.includes("city-forge-restricted"));
});

test("missing provider is fail-closed", () => {
  const availability = evaluateAvailability(entry, profile(), {
    sourceKind: "item",
    providerAvailability: {
      connected: false,
      reason: "city-forge-unavailable"
    }
  });
  assert.equal(availability.available, false);
  assert.ok(availability.reasons.includes("city-forge-unavailable"));
});
