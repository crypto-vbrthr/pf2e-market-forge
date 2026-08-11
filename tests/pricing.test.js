import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultMarketProfile } from "../scripts/market/profile-defaults.js";
import { PriceService } from "../scripts/pricing/price-service.js";

const service = new PriceService();
const profile = createDefaultMarketProfile();

describe("Pricing contract", () => {
  it("buys at the configured purchase multiplier", () => {
    const quote = service.quotePurchase({ baseUnitPrice: 12180 }, 2, profile);
    assert.equal(quote.unitPrice, 12180);
    assert.equal(quote.totalPrice, 24360);
    assert.equal(quote.rule, "standard-buy");
  });

  it("sells normal equipment at 50 percent by default", () => {
    const quote = service.quoteSale({ baseUnitPrice: 12180 }, 1, profile);
    assert.equal(quote.unitPrice, 6090);
    assert.equal(quote.rule, "standard-sell");
  });

  for (const treasureCategory of ["art-object", "gem", "material"]) {
    it(`sells ${treasureCategory} treasure at full value`, () => {
      const quote = service.quoteSale({ baseUnitPrice: 5000, treasureCategory }, 2, profile);
      assert.equal(quote.multiplier, 1);
      assert.equal(quote.totalPrice, 10000);
      assert.equal(quote.rule, "full-value-treasure");
    });
  }

  it("rejects zero quantities", () => {
    assert.throws(() => service.quotePurchase({ baseUnitPrice: 100 }, 0, profile));
  });
});
