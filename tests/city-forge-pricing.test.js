import test from "node:test";
import assert from "node:assert/strict";
import { PriceService } from "../scripts/pricing/price-service.js";
import { createDefaultMarketProfile } from "../scripts/market/profile-defaults.js";

test("City Forge buy multiplier composes with Market Forge buy multiplier", () => {
  const service = new PriceService();
  const profile = createDefaultMarketProfile({
    pricing: { buyMultiplier: 1.1 }
  });
  const quote = service.quotePurchase({
    baseUnitPrice: 100,
    pricePer: 1,
    stackPrice: 100,
    availability: { providerPriceMultiplier: 1.2 }
  }, 1, profile);

  assert.equal(quote.multiplier, 1.32);
  assert.equal(quote.totalPrice, 132);
  assert.ok(quote.reasons.includes("city-forge-price-multiplier"));
});

test("City Forge price multiplier does not alter sale pricing", () => {
  const service = new PriceService();
  const profile = createDefaultMarketProfile({
    pricing: { sellMultiplier: 0.5 }
  });
  const quote = service.quoteSale({
    baseUnitPrice: 100,
    pricePer: 1,
    stackPrice: 100,
    availability: { providerPriceMultiplier: 3 }
  }, 1, profile);

  assert.equal(quote.multiplier, 0.5);
  assert.equal(quote.totalPrice, 50);
});
