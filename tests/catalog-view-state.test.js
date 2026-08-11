import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createCatalogViewState, toggleExpandedUuid, updateCatalogViewState } from "../scripts/applications/catalog-view-state.js";

describe("Catalog view state contract", () => {
  it("creates stable filter defaults and updates one field immutably", () => {
    const state = createCatalogViewState();
    assert.deepEqual(state, { search: "", category: "all", level: "all", rarity: "all", sourcePack: "all" });
    const next = updateCatalogViewState(state, "level", 7);
    assert.equal(next.level, "7");
    assert.equal(state.level, "all");
  });

  it("toggles expanded item UUIDs without mutating the input set", () => {
    const original = new Set(["A"]);
    const opened = toggleExpandedUuid(original, "B");
    assert.deepEqual([...opened].sort(), ["A", "B"]);
    assert.deepEqual([...original], ["A"]);
    const closed = toggleExpandedUuid(opened, "A");
    assert.deepEqual([...closed], ["B"]);
  });

  it("rejects unsupported filters", () => {
    assert.throws(() => updateCatalogViewState(createCatalogViewState(), "price", "1"), /Unsupported catalog filter/);
  });
});
