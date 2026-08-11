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

  it("uses a generated purchase source for scrolls and wands instead of resolving a compendium item UUID", async () => {
    let balance = 10000;
    const generatedSource = { type: "consumable", name: "Scroll of Heal", system: { quantity: 1, spell: { name: "Heal" } } };
    const calls = [];
    const spellRequest = {
      direction: "buy",
      profileId: "default",
      itemActorUuid: "Actor.pc",
      currencyActorUuid: "Actor.pc",
      requestedByUserId: "User.player",
      lines: [{ quantity: 2, product: { kind: "scroll", spellUuid: "Compendium.spells.heal", spellRank: 3 } }]
    };
    const service = new TransactionService({
      profileProvider: async () => profile,
      productResolver: async () => ({
        uuid: "spell-product:scroll:heal:3",
        name: "Scroll of Heal",
        baseUnitPrice: 3000,
        availability: { available: true, reasons: [] },
        purchaseSource: generatedSource
      }),
      balanceProvider: async () => balance,
      currencyAdapter: {
        async remove(_uuid, amount) { balance -= amount; return true; },
        async add(_uuid, amount) { balance += amount; }
      },
      inventoryAdapter: {
        async addSource(actorUuid, source, quantity, options) { calls.push([actorUuid, source, quantity, options]); return { type: "create", actorUuid, itemId: "scroll" }; },
        async addFromUuid() { throw new Error("generated spell items must not use addFromUuid"); },
        async rollbackMutation() {},
        async refresh() {}
      },
      receiptService: { async createPurchaseReceipt() {} },
      permissionProvider: async () => true,
      lock: new TransactionLock()
    });

    const result = await service.checkout(spellRequest);
    assert.equal(result.status, "completed");
    assert.equal(result.total, 6000);
    assert.equal(balance, 4000);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0][1], generatedSource);
    assert.equal(calls[0][2], 2);
    assert.equal(calls[0][3].sourceUuid, "spell-product:scroll:heal:3");
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

const saleRequest = (quantity = 2) => ({
  direction: "sell",
  profileId: "default",
  itemActorUuid: "Actor.pc",
  currencyActorUuid: "Actor.pc",
  requestedByUserId: "User.player",
  lines: [{ quantity, product: { kind: "item", inventoryItemUuid: "Actor.pc.Item.sword", quotedUnitPrice: 1 } }]
});

function resolvedSale(product, { price = 1000, quantity = 3, treasureCategory = null, available = true } = {}) {
  return {
    uuid: product.inventoryItemUuid,
    name: "Owned Item",
    baseUnitPrice: price,
    treasureCategory,
    quantity,
    availableQuantity: quantity,
    availability: { available, reasons: available ? [] : ["temporary"] }
  };
}

describe("Milestone 5 sale transaction execution", () => {
  it("re-resolves the owned item, ignores quoted sale prices, and projects credited balance", async () => {
    const service = new TransactionService({
      profileProvider: async () => profile,
      productResolver: async (product, context) => {
        assert.equal(context.direction, "sell");
        assert.equal(context.itemActorUuid, "Actor.pc");
        assert.equal(context.authoritative, true);
        return resolvedSale(product);
      },
      balanceProvider: async () => 2000,
      idFactory: () => "tx-sale-dry"
    });

    const { plan, validation } = await service.dryRun(saleRequest(2));
    assert.equal(plan.total, 1000);
    assert.equal(plan.lines[0].price.unitPrice, 500);
    assert.equal("quotedUnitPrice" in plan.lines[0].product, false);
    assert.equal(validation.valid, true);
    assert.equal(validation.availableBalance, 2000);
    assert.equal(validation.remainingBalance, 3000);
  });

  it("completes a sale by removing inventory first and then crediting proceeds", async () => {
    let balance = 2000;
    const order = [];
    const receipts = [];
    const service = new TransactionService({
      profileProvider: async () => profile,
      productResolver: async (product) => resolvedSale(product),
      balanceProvider: async () => balance,
      currencyAdapter: {
        async add(_uuid, amount) { order.push("currency"); balance += amount; },
        async remove(_uuid, amount) { balance -= amount; return true; }
      },
      inventoryAdapter: {
        async removeOwnedItem(actorUuid, uuid, quantity) {
          order.push("item");
          assert.deepEqual([actorUuid, uuid, quantity], ["Actor.pc", "Actor.pc.Item.sword", 2]);
          return { type: "quantity-remove", actorUuid, itemId: "sword", previousQuantity: 3 };
        },
        async rollbackMutation() { throw new Error("not expected"); },
        async refresh() {}
      },
      receiptService: { async createSaleReceipt(data) { receipts.push(data); } },
      permissionProvider: async () => true,
      lock: new TransactionLock(),
      idFactory: () => "tx-sale"
    });

    const result = await service.checkout(saleRequest(2));
    assert.equal(result.status, "completed");
    assert.equal(result.total, 1000);
    assert.equal(result.remainingBalance, 3000);
    assert.equal(balance, 3000);
    assert.deepEqual(order, ["item", "currency"]);
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].plan.direction, "sell");
  });

  it("uses full value for gems during sale checkout", async () => {
    const service = new TransactionService({
      profileProvider: async () => profile,
      productResolver: async (product) => resolvedSale(product, { price: 5000, quantity: 2, treasureCategory: "gem" }),
      balanceProvider: async () => 0
    });
    const { plan, validation } = await service.dryRun(saleRequest(2));
    assert.equal(validation.valid, true);
    assert.equal(plan.total, 10000);
    assert.equal(plan.lines[0].price.rule, "full-value-treasure");
  });

  it("rejects a requested quantity that is no longer present before mutation", async () => {
    let mutated = false;
    const service = new TransactionService({
      profileProvider: async () => profile,
      productResolver: async (product) => resolvedSale(product, { quantity: 1 }),
      balanceProvider: async () => 0,
      currencyAdapter: { async add() { mutated = true; }, async remove() { mutated = true; return true; } },
      inventoryAdapter: { async removeOwnedItem() { mutated = true; }, async rollbackMutation() {} },
      lock: new TransactionLock()
    });
    const result = await service.checkout(saleRequest(2));
    assert.equal(result.status, "failed");
    assert.equal(mutated, false);
    assert.ok(result.errors.includes("insufficient-quantity"));
  });

  it("rejects inventory entries blocked by sellability rules before mutation", async () => {
    let mutated = false;
    const service = new TransactionService({
      profileProvider: async () => profile,
      productResolver: async (product) => resolvedSale(product, { available: false }),
      balanceProvider: async () => 0,
      currencyAdapter: { async add() { mutated = true; }, async remove() { mutated = true; return true; } },
      inventoryAdapter: { async removeOwnedItem() { mutated = true; }, async rollbackMutation() {} },
      lock: new TransactionLock()
    });
    const result = await service.checkout(saleRequest(1));
    assert.equal(result.status, "failed");
    assert.equal(mutated, false);
    assert.ok(result.errors.includes("item-no-longer-available"));
  });

  it("restores already removed inventory when a later sale item removal fails", async () => {
    let balance = 2000;
    let removeCount = 0;
    const rolledBack = [];
    const req = saleRequest(1);
    req.lines.push({ quantity: 1, product: { kind: "item", inventoryItemUuid: "Actor.pc.Item.fail" } });

    const service = new TransactionService({
      profileProvider: async () => profile,
      productResolver: async (product) => resolvedSale(product, { price: 1000, quantity: 1 }),
      balanceProvider: async () => balance,
      currencyAdapter: { async add(_u, amount) { balance += amount; }, async remove(_u, amount) { balance -= amount; return true; } },
      inventoryAdapter: {
        async removeOwnedItem(actorUuid) {
          removeCount += 1;
          if (removeCount === 2) throw new Error("delete exploded");
          return { type: "delete", actorUuid, itemId: "first", source: { _id: "first", type: "weapon", system: { quantity: 1 } } };
        },
        async rollbackMutation(mutation) { rolledBack.push(mutation.itemId); },
        async refresh() {}
      },
      lock: new TransactionLock()
    });

    const result = await service.checkout(req);
    assert.equal(result.status, "rolled-back");
    assert.equal(balance, 2000);
    assert.deepEqual(rolledBack, ["first"]);
  });

  it("restores sold items if crediting proceeds fails", async () => {
    let balance = 2000;
    const rolledBack = [];
    const service = new TransactionService({
      profileProvider: async () => profile,
      productResolver: async (product) => resolvedSale(product, { quantity: 2 }),
      balanceProvider: async () => balance,
      currencyAdapter: {
        async add() { throw new Error("currency write failed"); },
        async remove(_u, amount) { balance -= amount; return true; }
      },
      inventoryAdapter: {
        async removeOwnedItem(actorUuid) { return { type: "quantity-remove", actorUuid, itemId: "sword", previousQuantity: 2 }; },
        async rollbackMutation(mutation) { rolledBack.push(mutation.itemId); },
        async refresh() {}
      },
      lock: new TransactionLock()
    });

    const result = await service.checkout(saleRequest(1));
    assert.equal(result.status, "rolled-back");
    assert.equal(balance, 2000);
    assert.deepEqual(rolledBack, ["sword"]);
  });

  it("compensates a partially credited balance when addCurrency throws", async () => {
    let balance = 2000;
    let itemRestored = false;
    const service = new TransactionService({
      profileProvider: async () => profile,
      productResolver: async (product) => resolvedSale(product, { quantity: 2 }),
      balanceProvider: async () => balance,
      currencyAdapter: {
        async add(_u, amount) { balance += amount; throw new Error("after partial credit"); },
        async remove(_u, amount) { balance -= amount; return true; }
      },
      inventoryAdapter: {
        async removeOwnedItem(actorUuid) { return { type: "quantity-remove", actorUuid, itemId: "sword", previousQuantity: 2 }; },
        async rollbackMutation() { itemRestored = true; },
        async refresh() {}
      },
      lock: new TransactionLock()
    });

    const result = await service.checkout(saleRequest(1));
    assert.equal(result.status, "rolled-back");
    assert.equal(balance, 2000);
    assert.equal(itemRestored, true);
  });

  it("does not roll back a completed sale merely because its receipt fails", async () => {
    let balance = 2000;
    let rolledBack = false;
    const service = new TransactionService({
      profileProvider: async () => profile,
      productResolver: async (product) => resolvedSale(product, { quantity: 2 }),
      balanceProvider: async () => balance,
      currencyAdapter: { async add(_u, amount) { balance += amount; }, async remove() { return true; } },
      inventoryAdapter: {
        async removeOwnedItem(actorUuid) { return { type: "quantity-remove", actorUuid, itemId: "sword", previousQuantity: 2 }; },
        async rollbackMutation() { rolledBack = true; },
        async refresh() {}
      },
      receiptService: { async createSaleReceipt() { throw new Error("chat unavailable"); } },
      lock: new TransactionLock()
    });
    const result = await service.checkout(saleRequest(1));
    assert.equal(result.status, "completed");
    assert.equal(rolledBack, false);
    assert.ok(result.warnings.includes("receipt-failed"));
  });
});
