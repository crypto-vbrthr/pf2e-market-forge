import test from "node:test";
import assert from "node:assert/strict";
import {
  CityForgeProvider,
  mapMarketSubject,
  normalizeAvailabilityProvider
} from "../scripts/integrations/city-forge-provider.js";

function liveModule() {
  const context = {
    settlement: { id: "settlement-1", name: "Ostwall", level: 4, type: "village" },
    market: { id: "default", name: null },
    availability: { baseLevel: 4 },
    provenance: { revision: 7 }
  };
  return {
    active: true,
    api: {
      version: 1,
      capabilities: { economy: true, marketSources: true },
      economy: {
        async getSources() {
          return [{
            id: "settlement-1::default",
            settlementId: "settlement-1",
            marketId: "default",
            settlementName: "Ostwall",
            settlementLevel: 4,
            marketLabel: "Allgemeiner Markt",
            label: "Ostwall · Allgemeiner Markt",
            revision: 7
          }];
        },
        async getSource(id) {
          return id === "settlement-1::default"
            ? (await this.getSources())[0]
            : null;
        },
        async getContextForSource(id) {
          return id === "settlement-1::default" ? context : null;
        },
        evaluateContext(_context, subject) {
          return {
            subject,
            maximumLevel: subject.itemType === "weapon" ? 8 : 4,
            availability: subject.rarity === "uncommon" ? "available" : "available",
            levelAvailable: subject.level == null || subject.level <= (subject.itemType === "weapon" ? 8 : 4),
            available: true,
            restricted: false,
            priceMultiplier: 1.25,
            matchedRules: [],
            matchedAccessRules: []
          };
        }
      }
    }
  };
}

test("manual profiles do not activate the City Forge provider", async () => {
  const provider = new CityForgeProvider({ moduleProvider: () => liveModule() });
  const session = await provider.createSession({
    availability: { provider: { type: "manual", sourceId: "" } }
  });
  assert.equal(session.type, "manual");
  assert.equal(session.connected, true);
});

test("live provider resolves source and evaluates Market Forge catalog-shaped entries", async () => {
  const provider = new CityForgeProvider({ moduleProvider: () => liveModule() });
  const profile = {
    availability: { provider: { type: "city-forge", sourceId: "settlement-1::default" } }
  };

  const session = await provider.createSession(profile);
  assert.equal(session.connected, true);
  assert.equal(session.source.settlementName, "Ostwall");

  const result = session.evaluateEntry({
    uuid: "Compendium.pf2e.equipment-srd.Item.axe",
    itemType: "weapon",
    category: "martial",
    level: 8,
    rarity: "uncommon",
    traits: ["dwarf"],
    slug: "dwarven-axe"
  }, { sourceKind: "item" });

  assert.equal(result.evaluation.maximumLevel, 8);
  assert.equal(result.evaluation.priceMultiplier, 1.25);
  assert.equal(result.evaluation.subject.itemType, "weapon");
});

test("live profiles fail closed when City Forge is unavailable", async () => {
  const provider = new CityForgeProvider({ moduleProvider: () => ({ active: false, api: null }) });
  const session = await provider.createSession({
    availability: { provider: { type: "city-forge", sourceId: "settlement-1::default" } }
  });
  assert.equal(session.connected, false);
  assert.equal(session.reason, "city-forge-unavailable");
});

test("provider normalization preserves live source ids and defaults older profiles to manual", () => {
  assert.deepEqual(normalizeAvailabilityProvider({ availability: {} }), { type: "manual", sourceId: "" });
  assert.deepEqual(
    normalizeAvailabilityProvider({ availability: { provider: { type: "city-forge", sourceId: "x::default" } } }),
    { type: "city-forge", sourceId: "x::default" }
  );
});

test("market subject mapping carries current Market Forge item and spell fields", () => {
  const item = mapMarketSubject({
    uuid: "Item.x",
    itemType: "weapon",
    category: "martial",
    level: 5,
    rarity: "common",
    traits: ["agile"],
    slug: "sword"
  });
  assert.equal(item.level, 5);
  assert.equal(item.itemType, "weapon");

  const spell = mapMarketSubject({
    uuid: "Spell.x",
    baseRank: 3,
    rarity: "uncommon",
    traditions: ["arcane"],
    traits: [],
    slug: "spell"
  }, { sourceKind: "spell" });
  assert.equal(spell.level, null);
  assert.deepEqual(spell.traditions, ["arcane"]);
});
