import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveMaximumItemLevel } from "../scripts/market/party-level-service.js";

const config = (mode, rounding = "floor", offset = 0, fixedLevel) => ({ mode, rounding, offset, fixedLevel });

describe("Party-derived market level contract", () => {
  it("floors average party level before applying offset", () => {
    const result = resolveMaximumItemLevel(config("party-average", "floor", 1), [7, 7, 8, 8]);
    assert.equal(result.rawValue, 7.5);
    assert.equal(result.roundedValue, 7);
    assert.equal(result.maximumItemLevel, 8);
  });

  it("supports highest and lowest member modes", () => {
    assert.equal(resolveMaximumItemLevel(config("party-highest"), [6, 8, 7]).maximumItemLevel, 8);
    assert.equal(resolveMaximumItemLevel(config("party-lowest"), [6, 8, 7]).maximumItemLevel, 6);
  });

  it("supports a fixed level", () => {
    assert.equal(resolveMaximumItemLevel(config("fixed", "floor", 99, 12)).maximumItemLevel, 12);
  });

  it("returns null for unlimited markets", () => {
    assert.equal(resolveMaximumItemLevel(config("unlimited"), [1, 20]), null);
  });

  it("requires party data for party modes", () => {
    assert.throws(() => resolveMaximumItemLevel(config("party-average"), []));
  });
});
