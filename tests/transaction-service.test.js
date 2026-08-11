import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultMarketProfile } from "../scripts/market/profile-defaults.js";
import { TransactionService } from "../scripts/transactions/transaction-service.js";

describe("Milestone 3 transaction dry run", () => {
  const profile = createDefaultMarketProfile();

  it("re-resolves products and ignores cart/client price claims", async () => {
    const service = new TransactionService({
      profileProvider: async () => profile,
      productResolver: async (product) => ({
        uuid: product.sourceUuid,
        name: "Real Item",
        baseUnitPrice: 1250,
        availability: { available: true, reasons: [] }
      }),
      balanceProvider: async () => 5000,
      idFactory: () => "tx-test",
      now: () => 123456
    });

    const { plan, validation } = await service.dryRun({
      direction: "buy",
      profileId: "default",
      itemActorUuid: "Actor.pc",
      currencyActorUuid: "Actor.pc",
      requestedByUserId: "User.player",
      lines: [{
        quantity: 2,
        product: {
          kind: "item",
          sourceUuid: "Compendium.pf2e.equipment-srd.Item.real",
          name: "Client Name",
          baseUnitPrice: 1,
          unitPrice: 1,
          totalPrice: 2
        }
      }]
    });

    assert.equal(plan.transactionId, "tx-test");
    assert.equal(plan.validatedAt, 123456);
    assert.equal(plan.total, 2500);
    assert.equal(plan.lines[0].price.unitPrice, 1250);
    assert.equal("baseUnitPrice" in plan.lines[0].product, false);
    assert.equal(validation.valid, true);
    assert.equal(validation.availableBalance, 5000);
    assert.equal(validation.remainingBalance, 2500);
  });

  it("fails validation when the payment source cannot afford the recalculated total", async () => {
    const service = new TransactionService({
      profileProvider: async () => profile,
      productResolver: async (product) => ({
        uuid: product.sourceUuid,
        name: "Real Item",
        baseUnitPrice: 2000,
        availability: { available: true, reasons: [] }
      }),
      balanceProvider: async () => 1500,
      idFactory: () => "tx-poor"
    });

    const { validation } = await service.dryRun({
      direction: "buy",
      profileId: "default",
      itemActorUuid: "Actor.pc",
      currencyActorUuid: "Actor.pc",
      requestedByUserId: "User.player",
      lines: [{ quantity: 1, product: { kind: "item", sourceUuid: "Compendium.x.Item.y" } }]
    });

    assert.equal(validation.valid, false);
    assert.ok(validation.errors.includes("insufficient-funds"));
    assert.equal(validation.remainingBalance, -500);
  });

  it("keeps document mutation disabled", async () => {
    const service = new TransactionService();
    await assert.rejects(() => service.execute({}), /disabled/i);
  });
});
