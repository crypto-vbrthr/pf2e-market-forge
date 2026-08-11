import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

const template = fs.readFileSync(new URL("../templates/market.hbs", import.meta.url), "utf8");

describe("Milestone 2 template contract", () => {
  it("exposes catalog filters, expandable rows, and full-item-sheet action", () => {
    for (const filter of ["search", "category", "level", "rarity", "sourcePack"]) {
      assert.match(template, new RegExp(`data-catalog-filter=["']${filter}["']`));
    }
    assert.match(template, /data-market-expand-item=/);
    assert.match(template, /data-market-open-item=/);
    assert.match(template, /\{\{\{preview\.renderedDescription\}\}\}/);
  });

  it("keeps the purchase action disabled during the read-only catalog milestone", () => {
    assert.match(template, /class="market-forge-cart-button" disabled/);
  });
});
