import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SpellCatalogService, mapSpellIndexEntry } from "../scripts/catalog/spell-catalog-service.js";
import { createDefaultMarketProfile } from "../scripts/market/profile-defaults.js";

function row({ id, name, rank = 1, rarity = "common", traits = [], traditions = ["arcane"], ritual = null }) {
  return {
    _id: id,
    name,
    type: "spell",
    img: `${id}.webp`,
    system: {
      level: { value: rank },
      traits: { rarity, value: traits, traditions },
      ritual,
      slug: name.toLowerCase().replaceAll(" ", "-")
    }
  };
}

function pack(rows) {
  let count = 0;
  return {
    collection: "pf2e.spells-srd",
    documentName: "Item",
    metadata: { label: "Spells" },
    async getIndex() { count += 1; return rows; },
    get count() { return count; }
  };
}

describe("SpellCatalogService contract", () => {
  it("maps ordinary ranked spells and excludes cantrips, focus spells, and rituals", () => {
    const sourcePack = "pf2e.spells-srd";
    assert.equal(mapSpellIndexEntry(row({ id: "fireball", name: "Fireball", rank: 3, traits: ["fire"] }), sourcePack)?.baseRank, 3);
    assert.equal(mapSpellIndexEntry(row({ id: "cantrip", name: "Ignition", traits: ["cantrip"] }), sourcePack), null);
    assert.equal(mapSpellIndexEntry(row({ id: "focus", name: "Focus", traits: ["focus"] }), sourcePack), null);
    assert.equal(mapSpellIndexEntry(row({ id: "ritual", name: "Ritual", ritual: { primary: {} } }), sourcePack), null);
  });

  it("indexes configured spell packs once and filters name, rank, tradition, rarity, and source", async () => {
    const p = pack([
      row({ id: "fireball", name: "Fireball", rank: 3, traditions: ["arcane", "primal"] }),
      row({ id: "heal", name: "Heal", rank: 1, traditions: ["divine", "primal"] }),
      row({ id: "secret", name: "Secret Spell", rank: 4, rarity: "uncommon", traditions: ["occult"] })
    ]);
    const profile = createDefaultMarketProfile();
    profile.sources.spellCompendia = ["pf2e.spells-srd"];
    profile.availability.rarities.uncommon = true;
    const service = new SpellCatalogService({ packProvider: () => new Map([["pf2e.spells-srd", p]]) });

    const found = await service.search({ profile, filters: { search: "fire", baseRank: 3, tradition: "primal", rarity: "common", sourcePack: "pf2e.spells-srd" } });
    assert.deepEqual(found.entries.map((entry) => entry.name), ["Fireball"]);
    assert.deepEqual(found.facets.ranks, [1, 3, 4]);
    assert.ok(found.facets.traditions.includes("occult"));
    await service.search({ profile });
    assert.equal(p.count, 1);
  });

  it("re-resolves a specific spell entry and applies current market rarity/source availability", async () => {
    const p = pack([row({ id: "rare", name: "Rare Spell", rank: 2, rarity: "rare" })]);
    const profile = createDefaultMarketProfile();
    profile.sources.spellCompendia = ["pf2e.spells-srd"];
    const service = new SpellCatalogService({ packProvider: () => new Map([["pf2e.spells-srd", p]]) });
    const entry = await service.getEntry("Compendium.pf2e.spells-srd.Item.rare", { profile });
    assert.equal(entry.name, "Rare Spell");
    assert.equal(entry.availability.available, false);
    assert.ok(entry.availability.reasons.includes("rarity-not-allowed"));
  });
});
