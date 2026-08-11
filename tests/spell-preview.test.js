import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SpellPreviewService } from "../scripts/catalog/spell-preview-service.js";

describe("Spell preview contract", () => {
  it("renders the selected heightened variant rather than only the base spell", async () => {
    const calls = [];
    const variant = {
      description: "Heightened description",
      traits: new Set(["fire"]),
      traditions: new Set(["arcane"]),
      getRollData({ castRank }) { calls.push(["roll", castRank]); return { castRank, heighten: castRank - 3 }; }
    };
    const spell = {
      type: "spell",
      uuid: "Compendium.spells.fireball",
      name: "Fireball",
      img: "fireball.webp",
      baseRank: 3,
      rarity: "common",
      loadVariant({ castRank }) { calls.push(["variant", castRank]); return variant; }
    };
    const service = new SpellPreviewService({
      resolver: async () => spell,
      enrichHtml: async (description, options) => {
        calls.push(["enrich", description, options.rollData.castRank]);
        return `<p>${description} @ ${options.rollData.castRank}</p>`;
      }
    });
    const preview = await service.getPreview(spell.uuid, 5);
    assert.equal(preview.baseRank, 3);
    assert.equal(preview.castRank, 5);
    assert.equal(preview.heightened, true);
    assert.equal(preview.heightenBy, 2);
    assert.equal(preview.renderedDescription, "<p>Heightened description @ 5</p>");
    assert.deepEqual(calls[0], ["variant", 5]);
    assert.deepEqual(calls[1], ["roll", 5]);
  });

  it("opens the original PF2e spell sheet", async () => {
    let rendered = false;
    const service = new SpellPreviewService({ resolver: async () => ({ type: "spell", sheet: { render(force) { rendered = force; } } }) });
    assert.equal(await service.openSheet("Spell.x"), true);
    assert.equal(rendered, true);
  });
});
