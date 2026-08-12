import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHECKOUT_QUERY,
  SESSION_DELIVERY_QUERY,
  SESSION_REQUEST_QUERY,
  MarketSocket
} from "../scripts/socket/market-socket.js";

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

function wireUserQuery(user, config, calls = []) {
  user.query = async (name, data, options) => {
    calls.push({ userId: user.id, name, data: structuredClone(data), options });
    const handler = config.queries[name];
    if (typeof handler !== "function") throw new Error(`Missing query handler: ${name}`);
    return handler(structuredClone(data));
  };
}

function makeTransportPair({ service, timeoutMs = 200, now = () => Date.now() } = {}) {
  const gm = { id: "gm", isGM: true, active: true };
  const player = { id: "player", isGM: false, active: true };
  const users = makeUsers(gm, player);
  const gmConfig = { queries: {} };
  const playerConfig = { queries: {} };
  const gmCalls = [];
  const playerCalls = [];

  const gmTransport = new MarketSocket({
    usersProvider: () => users,
    currentUserProvider: () => gm,
    configProvider: () => gmConfig,
    authoritativeService: service,
    timeoutMs,
    now,
    idFactory: (() => { let n = 0; return () => `gm-token-${++n}`; })()
  });
  const playerTransport = new MarketSocket({
    usersProvider: () => users,
    currentUserProvider: () => player,
    configProvider: () => playerConfig,
    authoritativeService: { checkout() { throw new Error("player must not execute"); } },
    timeoutMs,
    now,
    idFactory: (() => { let n = 0; return () => `player-request-${++n}`; })()
  });
  gmTransport.registerQueries();
  playerTransport.registerQueries();
  wireUserQuery(gm, gmConfig, gmCalls);
  wireUserQuery(player, playerConfig, playerCalls);
  return { gm, player, users, gmConfig, playerConfig, gmTransport, playerTransport, gmCalls, playerCalls };
}

const checkoutRequest = () => ({
  direction: "buy",
  profileId: "default",
  itemActorUuid: "Actor.hero",
  currencyActorUuid: "Actor.hero",
  lines: [{ quantity: 1, product: { kind: "item", sourceUuid: "Item.one" } }]
});

describe("GM-authoritative Foundry User query transport", () => {
  it("provisions a targeted requester session before checkout and returns a compact result", async () => {
    const seen = [];
    const pair = makeTransportPair({
      service: {
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

    const result = await pair.playerTransport.requestCheckout(checkoutRequest());

    assert.equal(result.status, "completed");
    assert.equal(result.total, 123);
    assert.equal(result.remainingBalance, 456);
    assert.equal("lines" in result, false, "wire response must not contain heavyweight transaction line snapshots");
    assert.equal(seen.length, 1);
    assert.equal(seen[0].options.requesterUserId, "player");
    assert.deepEqual(pair.gmCalls.map((call) => call.name), [SESSION_REQUEST_QUERY, CHECKOUT_QUERY]);
    assert.deepEqual(pair.playerCalls.map((call) => call.name), [SESSION_DELIVERY_QUERY]);
    const checkoutWire = pair.gmCalls.find((call) => call.name === CHECKOUT_QUERY).data;
    assert.equal("requesterUserId" in checkoutWire, false);
    assert.equal(typeof checkoutWire.sessionToken, "string");
  });

  it("does not reveal another user's GM-issued session token to a caller that claims their id", async () => {
    const victim = { id: "victim", isGM: false, active: true };
    const attacker = { id: "attacker", isGM: false, active: true };
    const gm = { id: "gm", isGM: true, active: true };
    const users = makeUsers(gm, victim, attacker);
    const gmConfig = { queries: {} };
    const victimConfig = { queries: {} };
    const attackerConfig = { queries: {} };
    const seen = [];
    const gmTransport = new MarketSocket({
      usersProvider: () => users,
      currentUserProvider: () => gm,
      configProvider: () => gmConfig,
      authoritativeService: { async checkout(_request, options) { seen.push(options.requesterUserId); return { status: "completed", direction: "buy", total: 0, errors: [], warnings: [] }; } },
      idFactory: (() => { let n = 0; return () => `secret-${++n}`; })()
    });
    const victimTransport = new MarketSocket({ usersProvider: () => users, currentUserProvider: () => victim, configProvider: () => victimConfig });
    const attackerTransport = new MarketSocket({ usersProvider: () => users, currentUserProvider: () => attacker, configProvider: () => attackerConfig, idFactory: () => "attacker-request" });
    gmTransport.registerQueries(); victimTransport.registerQueries(); attackerTransport.registerQueries();
    wireUserQuery(gm, gmConfig); wireUserQuery(victim, victimConfig); wireUserQuery(attacker, attackerConfig);

    const spoofResponse = await gm.query(SESSION_REQUEST_QUERY, { requesterUserId: "victim", requestId: "spoof" }, { timeout: 200 });
    assert.equal(spoofResponse.status, "delivered");
    assert.equal("token" in spoofResponse, false);

    const result = await attackerTransport.requestCheckout(checkoutRequest());
    assert.equal(result.status, "completed");
    assert.deepEqual(seen, ["attacker"]);
  });

  it("returns an immediate authority error if the GM checkout handler throws instead of timing out", async () => {
    const pair = makeTransportPair({ service: { async checkout() { throw new Error("boom"); } } });
    const result = await pair.playerTransport.requestCheckout({ ...checkoutRequest(), direction: "sell" });
    assert.deepEqual(result.errors, ["authority-error"]);
    assert.match(result.cause, /boom/);
  });

  it("maps a rejected checkout query timeout to authority-timeout", async () => {
    const pair = makeTransportPair({ service: { async checkout() { return { status: "completed", direction: "buy", total: 0, errors: [], warnings: [] }; } }, timeoutMs: 20 });
    const normalQuery = pair.gm.query;
    pair.gm.query = async (name, data, options) => {
      if (name === CHECKOUT_QUERY) throw new Error("Query timed out after 30 seconds");
      return normalQuery(name, data, options);
    };
    const result = await pair.playerTransport.requestCheckout(checkoutRequest());
    assert.deepEqual(result.errors, ["authority-timeout"]);
  });

  it("refreshes an expired authority session and retries checkout once", async () => {
    let now = 1_000_000;
    const pair = makeTransportPair({
      now: () => now,
      service: { async checkout(request) { return { status: "completed", direction: request.direction, total: 1, errors: [], warnings: [] }; } }
    });
    assert.equal((await pair.playerTransport.requestCheckout(checkoutRequest())).status, "completed");
    now += 16 * 60 * 1000;
    assert.equal((await pair.playerTransport.requestCheckout(checkoutRequest())).status, "completed");
    assert.equal(pair.gmCalls.filter((call) => call.name === SESSION_REQUEST_QUERY).length, 2);
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
