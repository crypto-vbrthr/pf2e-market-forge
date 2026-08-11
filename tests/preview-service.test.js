import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ItemPreviewService } from "../scripts/catalog/preview-service.js";

describe("ItemPreviewService contract", () => {
  it("loads and enriches a physical item lazily, then caches the preview", async () => {
    let resolveCalls = 0;
    let enrichCalls = 0;
    const item = {
      type: "weapon",
      name: "Test Sword",
      img: "sword.webp",
      level: 4,
      rarity: "uncommon",
      traits: new Set(["magical", "fire"]),
      description: "<p>Raw</p>",
      system: {
        publication: { title: "Test Book" },
        usage: { value: "held-in-one-hand" },
        bulk: { value: "1" },
        activate: { actionCost: { type: "action", value: 1 } }
      },
      getRollData: () => ({ test: true })
    };
    const service = new ItemPreviewService({
      resolver: async () => { resolveCalls += 1; return item; },
      enrichHtml: async (description, context) => {
        enrichCalls += 1;
        assert.equal(description, "<p>Raw</p>");
        assert.equal(context.item, item);
        assert.deepEqual(context.rollData, { test: true });
        return "<p>Enriched</p>";
      }
    });

    const first = await service.getPreview("Compendium.test.Item.sword");
    const second = await service.getPreview("Compendium.test.Item.sword");
    assert.equal(first.renderedDescription, "<p>Enriched</p>");
    assert.deepEqual(first.traits, ["magical", "fire"]);
    assert.equal(first.sourceLabel, "Test Book");
    assert.equal(first.usage, "held-in-one-hand");
    assert.equal(first.bulk, "1");
    assert.equal(first.activation, "1 action");
    assert.equal(first, second);
    assert.equal(resolveCalls, 1);
    assert.equal(enrichCalls, 1);
  });

  it("opens the original item sheet on demand", async () => {
    let rendered = false;
    const service = new ItemPreviewService({
      resolver: async () => ({ sheet: { render: (force) => { rendered = force; } } })
    });
    assert.equal(await service.openSheet("Compendium.test.Item.x"), true);
    assert.equal(rendered, true);
  });

  it("rejects non-physical preview targets", async () => {
    const service = new ItemPreviewService({ resolver: async () => ({ type: "spell" }) });
    await assert.rejects(() => service.getPreview("Compendium.test.Item.spell"), /not physical/);
  });
});
