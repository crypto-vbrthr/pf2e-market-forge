import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CHECKOUT_QUERY, MarketSocket } from "../scripts/socket/market-socket.js";

class Bus {
  handlers = new Map();
  emitted = [];
  on(channel, handler) {
    const list = this.handlers.get(channel) ?? [];
    list.push(handler);
    this.handlers.set(channel, list);
  }
  emit(channel, message) {
    this.emitted.push({ channel, message: structuredClone(message) });
    for (const handler of this.handlers.get(channel) ?? []) queueMicrotask(() => handler(structuredClone(message)));
  }
}

function makeUsers(...users) {
  const collection = new Map(users.map((user) => [user.id, user]));
  collection.activeGM = users.find((user) => user.isGM && user.active) ?? null;
  return collection;
}

describe("GM-authoritative Foundry User query transport", () => {
  it("routes a player checkout through the targeted active GM query and returns a compact result", async () => {
    const config = { queries: {} };
    const gm = { id: "gm", isGM: true, active: true };
    const player = { id: "player", isGM: false, active: true };
    const users = makeUsers(gm, player);
    const seen = [];

    const gmTransport = new MarketSocket({
      usersProvider: () => users,
      currentUserProvider: () => gm,
      configProvider: () => config,
      authoritativeService: {
        async checkout(request, options) {
          seen.push({ request, options });
          return {
            transactionId: "tx",
            status: "completed",
            direction: request.direction,
            total: 123,
            remainingBalance: 456,
            lines: [{ very: "large", source: { ignored: true } }],
            errors: [],
            warnings: []
          };
        }
      }
    });
    assert.equal(gmTransport.registerQueries(), true);

    gm.query = async (name, data, options) => {
      assert.equal(name, CHECKOUT_QUERY);
      assert.equal(options.timeout, 200);
      return config.queries[name](structuredClone(data), options);
    };

    const playerTransport = new MarketSocket({
      usersProvider: () => users,
      currentUserProvider: () => player,
      configProvider: () => config,
      authoritativeService: { checkout() { throw new Error("player must not execute"); } },
      timeoutMs: 200
    });

    const result = await playerTransport.requestCheckout({
      direction: "buy",
      profileId: "default",
      itemActorUuid: "Actor.hero",
      currencyActorUuid: "Actor.hero",
      lines: [{ quantity: 1, product: { kind: "item", sourceUuid: "Item.one" } }]
    });

    assert.equal(result.status, "completed");
    assert.equal(result.total, 123);
    assert.equal(result.remainingBalance, 456);
    assert.equal("lines" in result, false, "wire response must not contain heavyweight transaction line snapshots");
    assert.equal(seen.length, 1);
    assert.equal(seen[0].options.requesterUserId, "player");
  });

  it("returns an immediate authority error if the GM checkout handler throws instead of timing out", async () => {
    const config = { queries: {} };
    const gm = { id: "gm", isGM: true, active: true };
    const player = { id: "player", isGM: false, active: true };
    const users = makeUsers(gm, player);

    const gmTransport = new MarketSocket({
      usersProvider: () => users,
      currentUserProvider: () => gm,
      configProvider: () => config,
      authoritativeService: { async checkout() { throw new Error("boom"); } }
    });
    gmTransport.registerQueries();
    gm.query = (name, data, options) => config.queries[name](structuredClone(data), options);

    const playerTransport = new MarketSocket({ usersProvider: () => users, currentUserProvider: () => player, timeoutMs: 200 });
    const result = await playerTransport.requestCheckout({ direction: "sell", profileId: "default", itemActorUuid: "Actor.party", currencyActorUuid: "Actor.party", lines: [{ quantity: 1, product: { kind: "item", inventoryItemUuid: "Actor.party.Item.one" } }] });
    assert.deepEqual(result.errors, ["authority-error"]);
    assert.match(result.cause, /boom/);
  });

  it("maps a rejected Foundry query timeout to authority-timeout", async () => {
    const timeout = new Error("Query timed out after 30 seconds");
    const gm = { id: "gm", isGM: true, active: true, query: async () => { throw timeout; } };
    const player = { id: "player", isGM: false, active: true };
    const users = makeUsers(gm, player);
    const transport = new MarketSocket({ usersProvider: () => users, currentUserProvider: () => player, timeoutMs: 20 });
    const result = await transport.requestCheckout({ direction: "sell" });
    assert.deepEqual(result.errors, ["authority-timeout"]);
  });

  it("prefers Foundry's designated activeGM over fallback id ordering", () => {
    const gmA = { id: "aaa-gm", isGM: true, active: true };
    const gmB = { id: "zzz-gm", isGM: true, active: true };
    const users = new Map([[gmA.id, gmA], [gmB.id, gmB]]);
    users.activeGM = gmB;
    const socket = new MarketSocket({ usersProvider: () => users, currentUserProvider: () => gmA });
    assert.equal(socket.getAuthorityGmId(), gmB.id);
  });

  it("fails safely when no active GM exists", async () => {
    const player = { id: "player", isGM: false, active: true };
    const socket = new MarketSocket({ usersProvider: () => new Map([[player.id, player]]), currentUserProvider: () => player, timeoutMs: 20 });
    const result = await socket.requestCheckout({ direction: "sell" });
    assert.deepEqual(result.errors, ["authority-unavailable"]);
  });

  it("keeps the raw module socket only for profile-change broadcasts", async () => {
    const bus = new Bus();
    const gm = { id: "gm", isGM: true, active: true };
    const player = { id: "player", isGM: false, active: true };
    const users = makeUsers(gm, player);
    const hooks = [];
    const oldHooks = globalThis.Hooks;
    globalThis.Hooks = { callAll: (...args) => hooks.push(args) };
    try {
      const gmTransport = new MarketSocket({ socketProvider: () => bus, usersProvider: () => users, currentUserProvider: () => gm });
      const playerTransport = new MarketSocket({ socketProvider: () => bus, usersProvider: () => users, currentUserProvider: () => player });
      gmTransport.register();
      playerTransport.register();
      assert.equal(gmTransport.broadcastProfilesChanged("village"), true);
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.equal(hooks.length, 1);
      assert.deepEqual(hooks[0], ["pf2e-market-forge.profilesChanged", "village"]);
      assert.equal(bus.emitted.some((entry) => entry.message.type === "checkout-request"), false);
    } finally {
      globalThis.Hooks = oldHooks;
    }
  });
});
