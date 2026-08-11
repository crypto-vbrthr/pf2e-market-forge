import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultMarketProfile } from "../scripts/market/profile-defaults.js";
import { TransactionLock } from "../scripts/transactions/transaction-lock.js";
import { TransactionService } from "../scripts/transactions/transaction-service.js";

const profile = createDefaultMarketProfile();
const request = (quantity = 2) => ({
  direction: "buy",
  profileId: "default",
  itemActorUuid: "Actor.pc",
  currencyActorUuid: "Actor.pc",
  requestedByUserId: "User.player",
  lines: [{ quantity, product: { kind: "item", sourceUuid: "Compendium.x.Item.real", unitPrice: 1 } }]
});

function resolved(product, price = 1250) {
  return {
    uuid: product.sourceUuid,
    name: "Real Item",
    baseUnitPrice: price,
    availability: { available: true, reasons: [] }
  };
}

describe("Milestone 4 transaction execution", () => {
  it("re-resolves products and ignores cart/client price claims", async () => {
    const service = new TransactionService({
      profileProvider: async () => profile,
      productResolver: async (product, context) => {
        assert.equal(context.authoritative, true);
        return resolved(product);
      },
      balanceProvider: async () => 5000,
      idFactory: () => "tx-test",
      now: () => 123456
    });

    const { plan, validation } = await service.dryRun(request());
    assert.equal(plan.transactionId, "tx-test");
    assert.equal(plan.validatedAt, 123456);
    assert.equal(plan.total, 2500);
    assert.equal(plan.lines[0].price.unitPrice, 1250);
    assert.equal("unitPrice" in plan.lines[0].product, false);
    assert.equal(validation.valid, true);
    assert.equal(validation.remainingBalance, 2500);
  });

  it("completes a purchase, deducts money, adds items, and writes a receipt", async () => {
    let balance = 5000;
    const added = [];
    const receipts = [];
    const service = new TransactionService({
      profileProvider: async () => profile,
      productResolver: async (product) => resolved(product),
      balanceProvider: async () => balance,
      currencyAdapter: {
        async remove(_uuid, amount) { if (amount > balance) return false; balance -= amount; return true; },
        async add(_uuid, amount) { balance += amount; }
      },
      inventoryAdapter: {
        async addFromUuid(actorUuid, uuid, quantity) {
          added.push([actorUuid, uuid, quantity]);
          return { type: "create", actorUuid, itemId: `new-${added.length}` };
        },
        async rollbackMutation() { throw new Error("not expected"); },
        async refresh() {}
      },
      receiptService: { async createPurchaseReceipt(data) { receipts.push(data); } },
      permissionProvider: async () => true,
      lock: new TransactionLock(),
      idFactory: () => "tx-buy"
    });

    const result = await service.checkout(request());
    assert.equal(result.status, "completed");
    assert.equal(result.total, 2500);
    assert.equal(result.remainingBalance, 2500);
    assert.equal(balance, 2500);
    assert.deepEqual(added, [["Actor.pc", "Compendium.x.Item.real", 2]]);
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].plan.transactionId, "tx-buy");
  });

  it("rolls back prior item additions and refunds currency after an item failure", async () => {
    let balance = 5000;
    const rolledBack = [];
    let addCount = 0;
    const twoLineRequest = request(1);
    twoLineRequest.lines.push({ quantity: 1, product: { kind: "item", sourceUuid: "Compendium.x.Item.fail" } });

    const service = new TransactionService({
      profileProvider: async () => profile,
      productResolver: async (product) => resolved(product, 1000),
      balanceProvider: async () => balance,
      currencyAdapter: {
        async remove(_uuid, amount) { balance -= amount; return true; },
        async add(_uuid, amount) { balance += amount; }
      },
      inventoryAdapter: {
        async addFromUuid(actorUuid) {
          addCount += 1;
          if (addCount === 2) throw new Error("creation exploded");
          return { type: "create", actorUuid, itemId: "first" };
        },
        async rollbackMutation(mutation) { rolledBack.push(mutation.itemId); },
        async refresh() {}
      },
      receiptService: { async createPurchaseReceipt() {} },
      lock: new TransactionLock()
    });

    const result = await service.checkout(twoLineRequest);
    assert.equal(result.status, "rolled-back");
    assert.equal(balance, 5000);
    assert.deepEqual(rolledBack, ["first"]);
    assert.ok(result.errors.includes("transaction-error"));
  });

  it("reports rollback-failed when compensation cannot fully restore state", async () => {
    let balance = 5000;
    const service = new TransactionService({
      profileProvider: async () => profile,
      productResolver: async (product) => resolved(product, 1000),
      balanceProvider: async () => balance,
      currencyAdapter: {
        async remove(_uuid, amount) { balance -= amount; return true; },
        async add() { throw new Error("refund failed"); }
      },
      inventoryAdapter: {
        async addFromUuid() { throw new Error("item failed"); },
        async rollbackMutation() {},
        async refresh() {}
      },
      lock: new TransactionLock()
    });

    const result = await service.checkout(request(1));
    assert.equal(result.status, "rollback-failed");
    assert.ok(result.warnings.includes("rollback-incomplete"));
    assert.match(result.rollbackErrors[0], /refund failed/);
  });

  it("does not mutate when funds validation fails", async () => {
    let mutation = false;
    const service = new TransactionService({
      profileProvider: async () => profile,
      productResolver: async (product) => resolved(product, 2000),
      balanceProvider: async () => 1500,
      currencyAdapter: { async remove() { mutation = true; return true; }, async add() {} },
      inventoryAdapter: { async addFromUuid() { mutation = true; }, async rollbackMutation() {} },
      permissionProvider: async () => true,
      lock: new TransactionLock()
    });
    const result = await service.checkout(request(1));
    assert.equal(result.status, "failed");
    assert.equal(mutation, false);
    assert.ok(result.errors.includes("insufficient-funds"));
  });

  it("does not mutate when the requesting user lacks update permission", async () => {
    let mutation = false;
    const service = new TransactionService({
      profileProvider: async () => profile,
      productResolver: async (product) => resolved(product, 100),
      balanceProvider: async () => 5000,
      currencyAdapter: { async remove() { mutation = true; return true; }, async add() {} },
      inventoryAdapter: { async addFromUuid() { mutation = true; }, async rollbackMutation() {} },
      permissionProvider: async () => false,
      lock: new TransactionLock()
    });
    const result = await service.checkout(request(1));
    assert.equal(result.status, "failed");
    assert.equal(mutation, false);
    assert.ok(result.errors.includes("permission-denied"));
  });

  it("does not roll back a successful purchase merely because its receipt fails", async () => {
    let balance = 5000;
    let rolledBack = false;
    const service = new TransactionService({
      profileProvider: async () => profile,
      productResolver: async (product) => resolved(product, 100),
      balanceProvider: async () => balance,
      currencyAdapter: { async remove(_u, amount) { balance -= amount; return true; }, async add(_u, amount) { balance += amount; } },
      inventoryAdapter: {
        async addFromUuid(actorUuid) { return { type: "create", actorUuid, itemId: "new" }; },
        async rollbackMutation() { rolledBack = true; },
        async refresh() {}
      },
      receiptService: { async createPurchaseReceipt() { throw new Error("chat unavailable"); } },
      lock: new TransactionLock()
    });
    const result = await service.checkout(request(1));
    assert.equal(result.status, "completed");
    assert.equal(rolledBack, false);
    assert.ok(result.warnings.includes("receipt-failed"));
  });

  it("rejects a second same-actor transaction while the first lock is active", async () => {
    const lock = new TransactionLock();
    let release;
    const blocker = new Promise((resolve) => { release = resolve; });
    const service = new TransactionService({
      profileProvider: async () => profile,
      productResolver: async (product) => resolved(product, 100),
      balanceProvider: async () => 5000,
      currencyAdapter: { async remove() { await blocker; return true; }, async add() {} },
      inventoryAdapter: { async addFromUuid(actorUuid) { return { type: "create", actorUuid, itemId: "x" }; }, async rollbackMutation() {}, async refresh() {} },
      receiptService: { async createPurchaseReceipt() {} },
      lock
    });

    const first = service.checkout(request(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const second = await service.checkout(request(1));
    assert.equal(second.status, "failed");
    assert.ok(second.errors.includes("transaction-locked"));
    release();
    assert.equal((await first).status, "completed");
  });

  it("refuses execution of a client-supplied plan", async () => {
    const service = new TransactionService();
    await assert.rejects(() => service.execute({}), /use checkout/i);
  });
});
