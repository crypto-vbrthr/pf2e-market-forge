import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SpellItemService } from "../scripts/spells/spell-item-service.js";

const service = new SpellItemService();

describe("Spell-item draft contract", () => {
  it("derives scroll item level and price from selected spell rank", () => {
    const draft = service.createDraft({
      kind: "scroll",
      spellUuid: "Spell.heal",
      spellName: "Heal",
      baseRank: 1,
      castRank: 5
    });

    assert.equal(draft.itemLevel, 9);
    assert.equal(draft.baseUnitPrice, 15000);
  });

  it("derives standard wand item level and price from selected spell rank", () => {
    const draft = service.createDraft({
      kind: "wand",
      spellUuid: "Spell.fireball",
      spellName: "Fireball",
      baseRank: 3,
      castRank: 3
    });

    assert.equal(draft.itemLevel, 7);
    assert.equal(draft.baseUnitPrice, 36000);
  });

  it("allows rank 10 scrolls", () => {
    assert.doesNotThrow(() => service.createDraft({
      kind: "scroll",
      spellUuid: "Spell.rank10",
      spellName: "Rank Ten",
      baseRank: 10,
      castRank: 10
    }));
  });

  it("rejects rank 10 standard wands", () => {
    assert.throws(() => service.createDraft({
      kind: "wand",
      spellUuid: "Spell.rank10",
      spellName: "Rank Ten",
      baseRank: 10,
      castRank: 10
    }));
  });

  it("rejects cast ranks below the spell's base rank", () => {
    assert.throws(() => service.createDraft({
      kind: "scroll",
      spellUuid: "Spell.fireball",
      spellName: "Fireball",
      baseRank: 3,
      castRank: 2
    }));
  });
});
