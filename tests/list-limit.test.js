import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_MARKET_LIST_LIMIT,
  normalizeMarketListLimit,
  readMarketListLimit
} from "../scripts/settings/list-limit.js";
import { SETTINGS } from "../scripts/settings/register-settings.js";

describe("market list result limit", () => {
  it("keeps configured values within the supported range", () => {
    assert.equal(normalizeMarketListLimit(25), 25);
    assert.equal(normalizeMarketListLimit(175), 175);
    assert.equal(normalizeMarketListLimit(500), 500);
  });

  it("clamps out-of-range values and truncates fractions", () => {
    assert.equal(normalizeMarketListLimit(1), 25);
    assert.equal(normalizeMarketListLimit(999), 500);
    assert.equal(normalizeMarketListLimit(123.9), 123);
  });

  it("falls back for invalid values", () => {
    assert.equal(normalizeMarketListLimit("nope"), DEFAULT_MARKET_LIST_LIMIT);
  });

  it("reads the dedicated world setting", () => {
    const getter = (key, fallback) => key === SETTINGS.MARKET_LIST_LIMIT ? 200 : fallback;
    assert.equal(readMarketListLimit(getter), 200);
  });
});
