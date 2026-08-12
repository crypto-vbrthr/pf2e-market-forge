import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { discoverItemCompendia, prepareCompendiumChoices } from "../scripts/settings/compendium-sources.js";

describe("market compendium source discovery", () => {
  it("lists Item compendia only and sorts them by label", () => {
    const packs = new Map([
      ["z", { collection: "world.z", documentName: "Item", metadata: { label: "Zeta" } }],
      ["a", { collection: "world.a", documentName: "Item", metadata: { label: "Alpha" } }],
      ["j", { collection: "world.j", documentName: "JournalEntry", metadata: { label: "Journal" } }]
    ]);
    assert.deepEqual(discoverItemCompendia(packs).map((entry) => entry.id), ["world.a", "world.z"]);
  });

  it("marks configured sources without changing discovery order", () => {
    const choices = prepareCompendiumChoices([
      { id: "a", label: "A" }, { id: "b", label: "B" }
    ], ["b"]);
    assert.deepEqual(choices.map(({ id, selected }) => [id, selected]), [["a", false], ["b", true]]);
  });
});
