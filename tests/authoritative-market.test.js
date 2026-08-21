import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AuthoritativeMarketService } from "../scripts/transactions/authoritative-market-service.js";
import { createDefaultMarketProfile } from "../scripts/market/profile-defaults.js";
import { TransactionCoordinator } from "../scripts/transactions/transaction-coordinator.js";

describe("GM-authoritative market service", () => {
  it("ignores a client-claimed requester and recomputes the current market level before checkout", async () => {
    const profile = createDefaultMarketProfile();
    const actor = { uuid: "Actor.hero", type: "character", level: 7 };
    const calls = [];
    const service = new AuthoritativeMarketService({
      profileService: { getProfile: (id) => id === "default" ? profile : null },
      actorProvider: async () => actor,
      userProvider: (id) => id === "User.actual" ? { id, active: true } : null,
      capabilityService: { assertWritableActor: () => ({ compatible: true, errors: [], missing: [] }) },
      coordinator: new TransactionCoordinator(),
      transactionService: {
        async checkout(request, options) { calls.push({ request, options }); return { status: "completed", direction: request.direction, total: 100, lines: [], errors: [], warnings: [] }; }
      }
    });

    const result = await service.checkout({
      direction: "buy", profileId: "default", itemActorUuid: "Actor.hero", currencyActorUuid: "Actor.hero",
      requestedByUserId: "User.spoofed",
      lines: [{ quantity: 1, product: { kind: "item", sourceUuid: "Compendium.market.Item.one" } }]
    }, { requesterUserId: "User.actual" });

    assert.equal(result.status, "completed");
    assert.equal(calls[0].request.requestedByUserId, "User.actual");
    assert.equal(calls[0].options.requestedByUserId, "User.actual");
    assert.equal(calls[0].options.maximumItemLevel, 7);
  });
  it("deduplicates retries with the same requester operation id", async () => {
    const profile = createDefaultMarketProfile();
    const actor = { uuid: "Actor.hero", type: "character", level: 7 };
    let executions = 0;
    const service = new AuthoritativeMarketService({
      profileService: { getProfile: () => profile },
      actorProvider: async () => actor,
      userProvider: (id) => ({ id, active: true }),
      capabilityService: { assertWritableActor: () => ({ compatible: true, errors: [], missing: [] }) },
      coordinator: new TransactionCoordinator(),
      transactionService: {
        async checkout(request) {
          executions += 1;
          await new Promise((resolve) => setTimeout(resolve, 5));
          return { transactionId: "tx-once", status: "completed", direction: request.direction, total: 100, lines: [], errors: [], warnings: [] };
        }
      }
    });
    const request = {
      direction: "buy", profileId: "default", itemActorUuid: "Actor.hero", currencyActorUuid: "Actor.hero",
      operationId: "operation-one",
      lines: [{ quantity: 1, product: { kind: "item", sourceUuid: "Compendium.market.Item.one" } }]
    };

    const [first, second] = await Promise.all([
      service.checkout(request, { requesterUserId: "User.actual" }),
      service.checkout(request, { requesterUserId: "User.actual" })
    ]);

    assert.equal(executions, 1);
    assert.equal(first.transactionId, "tx-once");
    assert.deepEqual(second, first);
  });

  it("rejects reuse of an operation id for a different checkout intent", async () => {
    const profile = createDefaultMarketProfile();
    const actor = { uuid: "Actor.hero", type: "character", level: 7 };
    let executions = 0;
    const service = new AuthoritativeMarketService({
      profileService: { getProfile: () => profile },
      actorProvider: async () => actor,
      userProvider: (id) => ({ id, active: true }),
      capabilityService: { assertWritableActor: () => ({ compatible: true, errors: [], missing: [] }) },
      coordinator: new TransactionCoordinator(),
      transactionService: {
        async checkout(request) {
          executions += 1;
          return { transactionId: `tx-${executions}`, status: "completed", direction: request.direction, total: 100, lines: [], errors: [], warnings: [] };
        }
      }
    });
    const common = {
      direction: "buy", profileId: "default", itemActorUuid: "Actor.hero", currencyActorUuid: "Actor.hero", operationId: "operation-reused"
    };
    const first = await service.checkout({
      ...common,
      lines: [{ quantity: 1, product: { kind: "item", sourceUuid: "Compendium.market.Item.one" } }]
    }, { requesterUserId: "User.actual" });
    const second = await service.checkout({
      ...common,
      lines: [{ quantity: 2, product: { kind: "item", sourceUuid: "Compendium.market.Item.two" } }]
    }, { requesterUserId: "User.actual" });

    assert.equal(first.status, "completed");
    assert.equal(second.status, "failed");
    assert.ok(second.errors.includes("operation-id-conflict"));
    assert.equal(executions, 1);
  });

  it("serializes two different players selling the same shared Party item and revalidates the second request", async () => {
    const profile = createDefaultMarketProfile();
    const actor = { uuid: "Actor.party", type: "party", level: 5, members: [] };
    const order = [];
    let quantity = 1;
    const service = new AuthoritativeMarketService({
      profileService: { getProfile: () => profile },
      actorProvider: async () => actor,
      userProvider: (id) => ({ id, active: true }),
      capabilityService: { assertWritableActor: () => ({ compatible: true, errors: [], missing: [] }) },
      coordinator: new TransactionCoordinator(),
      transactionService: {
        async checkout(request, options) {
          order.push(`${options.requestedByUserId}-start-${quantity}`);
          await new Promise((resolve) => setTimeout(resolve, 5));
          if (quantity < 1) {
            order.push(`${options.requestedByUserId}-rejected`);
            return { transactionId: "tx-second", status: "failed", direction: request.direction, total: 0, lines: [], errors: ["item-not-found"], warnings: [] };
          }
          quantity -= 1;
          order.push(`${options.requestedByUserId}-sold`);
          return { transactionId: "tx-first", status: "completed", direction: request.direction, total: 1000, lines: [], errors: [], warnings: [] };
        }
      }
    });
    const request = {
      direction: "sell",
      profileId: "default",
      itemActorUuid: "Actor.party",
      currencyActorUuid: "Actor.party",
      lines: [{ quantity: 1, product: { kind: "item", inventoryItemUuid: "Actor.party.Item.statue" } }]
    };

    const [first, second] = await Promise.all([
      service.checkout({ ...request, operationId: "player-a-sale" }, { requesterUserId: "User.a" }),
      service.checkout({ ...request, operationId: "player-b-sale" }, { requesterUserId: "User.b" })
    ]);

    assert.equal(first.status, "completed");
    assert.equal(second.status, "failed");
    assert.deepEqual(second.errors, ["item-not-found"]);
    assert.deepEqual(order, ["User.a-start-1", "User.a-sold", "User.b-start-0", "User.b-rejected"]);
  });


  it("refreshes the live City Forge provider on the authoritative GM before checkout", async () => {
    const profile = createDefaultMarketProfile({
      availability: {
        provider: { type: "city-forge", sourceId: "settlement-1::default" }
      }
    });
    const actor = { uuid: "Actor.hero", type: "character", level: 20 };
    const session = { type: "city-forge", connected: true, sourceId: "settlement-1::default" };
    const calls = [];

    const service = new AuthoritativeMarketService({
      profileService: { getProfile: () => profile },
      actorProvider: async () => actor,
      userProvider: (id) => ({ id, active: true }),
      capabilityService: { assertWritableActor: () => ({ compatible: true, errors: [], missing: [] }) },
      coordinator: new TransactionCoordinator(),
      cityForgeProvider: {
        async createSession(receivedProfile) {
          calls.push({ type: "provider", profile: receivedProfile });
          return session;
        }
      },
      transactionService: {
        async checkout(request, options) {
          calls.push({ type: "checkout", request, options });
          return { status: "completed", direction: request.direction, total: 100, lines: [], errors: [], warnings: [] };
        }
      }
    });

    const result = await service.checkout({
      direction: "buy",
      profileId: "default",
      itemActorUuid: "Actor.hero",
      currencyActorUuid: "Actor.hero",
      lines: [{ quantity: 1, product: { kind: "item", sourceUuid: "Compendium.market.Item.one" } }]
    }, { requesterUserId: "User.actual" });

    assert.equal(result.status, "completed");
    assert.equal(calls[0].type, "provider");
    assert.equal(calls[1].type, "checkout");
    assert.equal(calls[1].options.maximumItemLevel, null);
    assert.equal(calls[1].options.availabilitySession, session);
  });


});
