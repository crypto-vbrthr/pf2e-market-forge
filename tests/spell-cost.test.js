import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSpellExtraCost } from "../scripts/spells/spell-cost.js";
import { SpellItemService } from "../scripts/spells/spell-item-service.js";

describe("Spell extra-cost hardening", () => {
  it("parses fixed English and German currency costs", () => {
    assert.equal(parseSpellExtraCost("a diamond worth 100 gp").copper, 10000);
    assert.equal(parseSpellExtraCost("Räucherwerk im Wert von 25 GM").copper, 2500);
    assert.equal(parseSpellExtraCost("rare oils worth 1,000 gp").copper, 100000);
  });

  it("rejects variable and non-monetary free-text costs", () => {
    assert.equal(parseSpellExtraCost("50 gp per target").status, "unsupported");
    assert.equal(parseSpellExtraCost("50 gp × target level").status, "unsupported");
    assert.equal(parseSpellExtraCost("50 gp/level").status, "unsupported");
    assert.equal(parseSpellExtraCost("a living heart").status, "unsupported");
  });

  it("adds a fixed spell cost to scroll price but not to an ordinary wand price", () => {
    const service = new SpellItemService();
    const scroll = service.createDraft({ kind: "scroll", spellUuid: "Spell.costly", spellName: "Costly", baseRank: 3, castRank: 3, spellCost: "diamond worth 100 gp" });
    const wand = service.createDraft({ kind: "wand", spellUuid: "Spell.costly", spellName: "Costly", baseRank: 3, castRank: 3, spellCost: "diamond worth 100 gp" });
    assert.equal(scroll.baseUnitPrice, 13000);
    assert.equal(scroll.extraCostCopper, 10000);
    assert.equal(wand.baseUnitPrice, 36000);
    assert.equal(wand.extraCostCopper, 0);
  });

  it("blocks automatic scroll generation when a non-empty spell cost cannot be priced safely", () => {
    const draft = new SpellItemService().createDraft({ kind: "scroll", spellUuid: "Spell.variable", spellName: "Variable", baseRank: 1, castRank: 1, spellCost: "50 gp per target" });
    assert.equal(draft.availability.available, false);
    assert.ok(draft.availability.reasons.includes("spell-extra-cost-unsupported"));
  });
});
