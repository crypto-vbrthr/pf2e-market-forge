import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderPurchaseReceipt, renderSaleReceipt } from "../scripts/receipts/receipt-service.js";

describe("Purchase receipt", () => {
  it("renders line totals and escapes item/actor names", () => {
    globalThis.game = { i18n: { localize: (key) => key } };
    const html = renderPurchaseReceipt({
      actorName: '<Hero & Co>',
      remainingBalance: 500,
      plan: {
        total: 1250,
        lines: [{ quantity: 2, resolvedProduct: { name: '<Potion>' }, price: { totalPrice: 1250 } }]
      }
    });
    assert.match(html, /2 × &lt;Potion&gt;/);
    assert.match(html, /&lt;Hero &amp; Co&gt;/);
    assert.doesNotMatch(html, /<Potion>/);
  });
});


describe("Sale receipt", () => {
  it("renders sale proceeds and resulting balance", () => {
    globalThis.game = { i18n: { localize: (key) => key } };
    const html = renderSaleReceipt({
      actorName: "Seller",
      remainingBalance: 3500,
      plan: {
        total: 1500,
        lines: [{ quantity: 1, resolvedProduct: { name: "Gem" }, price: { totalPrice: 1500 } }]
      }
    });
    assert.match(html, /Gem/);
    assert.match(html, /Erlös/);
    assert.match(html, /Guthaben danach/);
  });
});
