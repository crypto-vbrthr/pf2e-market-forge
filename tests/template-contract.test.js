import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

const template = fs.readFileSync(new URL("../templates/market.hbs", import.meta.url), "utf8");

describe("Milestone 5 template contract", () => {
  it("keeps catalog filters and expandable item previews", () => {
    for (const filter of ["search", "category", "level", "rarity", "sourcePack"]) {
      assert.match(template, new RegExp(`data-catalog-filter=["']${filter}["']`));
    }
    assert.match(template, /data-market-expand-item=/);
    assert.match(template, /data-market-open-item=/);
    assert.match(template, /\{\{\{preview\.renderedDescription\}\}\}/);
  });

  it("offers safe validation and real purchase checkout", () => {
    assert.match(template, /data-market-quantity=/);
    assert.match(template, /data-market-add-item=/);
    assert.match(template, /data-market-dry-run/);
    assert.match(template, /data-market-checkout/);
    assert.match(template, /PF2E_MARKET_FORGE\.Cart\.CompletePurchase/);
  });

  it("offers inventory sale lines, partial quantities, a sale cart, and real sale checkout", () => {
    assert.match(template, /data-market-sale-quantity=/);
    assert.match(template, /data-market-add-sale=/);
    assert.match(template, /data-cart-direction="sell"/);
    assert.match(template, /PF2E_MARKET_FORGE\.Sell\.CompleteSale/);
    assert.match(template, /PF2E_MARKET_FORGE\.Sell\.FullValueRule/);
  });
});
