import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertCopperValue, coinsToCopper, copperToCoins, multiplyCopper } from "../scripts/core/money.js";

describe("CopperValue contract", () => {
  it("represents decimal GP prices exactly in copper", () => {
    assert.equal(coinsToCopper({ gp: 121, sp: 8 }), 12180);
  });

  it("round-trips PF2e coin denominations", () => {
    const copper = coinsToCopper({ pp: 2, gp: 7, sp: 4, cp: 9 });
    assert.deepEqual(copperToCoins(copper), { pp: 2, gp: 7, sp: 4, cp: 9 });
  });

  it("rejects fractional or negative copper values", () => {
    assert.throws(() => assertCopperValue(1.5));
    assert.throws(() => assertCopperValue(-1));
  });

  it("rounds multipliers to the nearest copper", () => {
    assert.equal(multiplyCopper(101, 0.5), 51);
  });
});
