import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateTransactionPlan } from "../scripts/transactions/transaction-validator.js";

describe("TransactionPlan contract", () => {
  it("accepts a plan whose authoritative line totals match its total", () => {
    const result = validateTransactionPlan({
      direction: "buy",
      total: 1200,
      lines: [{
        quantity: 1,
        availability: { available: true, reasons: [] },
        price: { totalPrice: 1200 }
      }]
    });

    assert.deepEqual(result, { valid: true, errors: [], warnings: [] });
  });

  it("rejects unavailable products and total mismatches", () => {
    const result = validateTransactionPlan({
      direction: "buy",
      total: 999,
      lines: [{
        quantity: 1,
        availability: { available: false, reasons: ["level-too-high"] },
        price: { totalPrice: 1200 }
      }]
    });

    assert.equal(result.valid, false);
    assert.ok(result.errors.includes("item-no-longer-available"));
    assert.ok(result.errors.includes("total-mismatch"));
  });
});
