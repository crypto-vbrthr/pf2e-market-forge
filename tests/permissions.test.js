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

describe("transaction permission contract", () => {
  it("checks update permission on both inventory and currency actors", async () => {
    const originalGame = globalThis.game;
    const originalFromUuid = globalThis.fromUuid;
    const player = { id: "player", isGM: false };
    const itemActor = { type: "character", canUserModify: () => true };
    const moneyActor = { type: "party", canUserModify: () => false };
    globalThis.game = { users: new Map([[player.id, player]]), user: player, actors: new Map() };
    globalThis.fromUuid = async (uuid) => uuid === "Actor.item" ? itemActor : moneyActor;
    try {
      const { MarketPermissionService } = await import("../scripts/permissions/permission-service.js");
      const service = new MarketPermissionService();
      assert.equal(await service.canBuy("player", "Actor.item", "Actor.money"), false);
      moneyActor.canUserModify = () => true;
      assert.equal(await service.canSell("player", "Actor.item", "Actor.money"), true);
    } finally {
      globalThis.game = originalGame;
      globalThis.fromUuid = originalFromUuid;
    }
  });
});
