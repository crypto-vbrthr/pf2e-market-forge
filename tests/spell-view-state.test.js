import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSpellViewState, updateSpellViewState } from "../scripts/applications/spell-view-state.js";

describe("Spell view state contract", () => {
  it("starts with stable spell filters and scroll rank configuration", () => {
    assert.deepEqual(createSpellViewState(), {
      search: "", baseRank: "all", tradition: "all", rarity: "all", sourcePack: "all",
      selectedSpellUuid: null, kind: "scroll", castRank: null, quantity: 1
    });
  });

  it("updates numeric rank/quantity without mutating the prior state", () => {
    const state = createSpellViewState();
    const ranked = updateSpellViewState(state, "castRank", "5");
    const quantity = updateSpellViewState(ranked, "quantity", "3");
    assert.equal(state.castRank, null);
    assert.equal(ranked.castRank, 5);
    assert.equal(quantity.quantity, 3);
  });

  it("rejects unknown spell view fields", () => {
    assert.throws(() => updateSpellViewState(createSpellViewState(), "mystery", "x"), /unknown spell view field/i);
  });
});
