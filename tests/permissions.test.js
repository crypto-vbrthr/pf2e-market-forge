import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canOpenActor } from "../scripts/permissions/permission-service.js";

describe("Milestone 1 launch permission contract", () => {
  const player = { isGM: false };
  const gm = { isGM: true };

  it("allows a GM to open supported actor types", () => {
    assert.equal(canOpenActor({ type: "character" }, gm), true);
    assert.equal(canOpenActor({ type: "party" }, gm), true);
  });

  it("allows players only when PF2e says they may update the actor", () => {
    const owned = { type: "character", canUserModify: (_user, action) => action === "update" };
    const unowned = { type: "character", canUserModify: () => false };
    assert.equal(canOpenActor(owned, player), true);
    assert.equal(canOpenActor(unowned, player), false);
  });

  it("does not expose Market Forge on unrelated actor types", () => {
    assert.equal(canOpenActor({ type: "npc", canUserModify: () => true }, player), false);
  });
});
