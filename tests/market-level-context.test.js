import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collectCharacterLevels, resolveMarketMaximumForActor, resolveReferenceParty } from "../scripts/market/market-level-context.js";
import { createDefaultMarketProfile } from "../scripts/market/profile-defaults.js";

describe("Market level context contract", () => {
  it("counts only character members for party-derived market level", () => {
    const party = {
      uuid: "Actor.party",
      name: "Party",
      type: "party",
      members: [
        { type: "character", level: 7 },
        { type: "character", level: 8 },
        { type: "npc", level: 20 },
        { type: "familiar", level: 99 }
      ]
    };
    assert.deepEqual(collectCharacterLevels(party.members), [7, 8]);
    const profile = createDefaultMarketProfile({ availability: { levelLimit: { mode: "party-average", offset: 1, rounding: "floor" } } });
    const context = resolveMarketMaximumForActor(profile, party);
    assert.equal(context.result.maximumItemLevel, 8);
  });

  it("prefers the active party when the character belongs to it", () => {
    const partyA = { uuid: "Actor.a", type: "party", members: [] };
    const partyB = { uuid: "Actor.b", type: "party", members: [] };
    const actor = { type: "character", parties: [partyA, partyB] };
    assert.equal(resolveReferenceParty(actor, partyB), partyB);
  });

  it("falls back to a standalone character level", () => {
    const profile = createDefaultMarketProfile({ availability: { levelLimit: { mode: "party-average", offset: 1, rounding: "floor" } } });
    const actor = { uuid: "Actor.hero", type: "character", level: 5 };
    const context = resolveMarketMaximumForActor(profile, actor);
    assert.deepEqual(context.memberLevels, [5]);
    assert.equal(context.result.maximumItemLevel, 6);
  });
});
