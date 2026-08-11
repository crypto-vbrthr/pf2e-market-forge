import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTabState, initialTabFromMode, normalizeMarketTab } from "../scripts/applications/market-window-state.js";

describe("Market window state contract", () => {
  it("opens buy for buy and browse modes", () => {
    assert.equal(initialTabFromMode("buy"), "buy");
    assert.equal(initialTabFromMode("browse"), "buy");
  });

  it("opens sell when launched in sell mode", () => {
    assert.equal(initialTabFromMode("sell"), "sell");
  });

  it("rejects unknown tabs by falling back to buy", () => {
    assert.equal(normalizeMarketTab("forbidden-secret-tab"), "buy");
  });

  it("marks exactly one tab active", () => {
    const tabs = buildTabState("spell-items");
    assert.equal(tabs["spell-items"].active, true);
    assert.equal(Object.values(tabs).filter((tab) => tab.active).length, 1);
  });
});
