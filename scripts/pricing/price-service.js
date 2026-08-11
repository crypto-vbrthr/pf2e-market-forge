import { assertCopperValue, multiplyCopper } from "../core/money.js";

const FULL_VALUE_CATEGORY_TO_SETTING = Object.freeze({
  "art-object": "artObjects",
  gem: "gems",
  material: "materials"
});

export class PriceService {
  quotePurchase(product, quantity, profile) {
    return quote(product, quantity, profile.pricing.buyMultiplier, "standard-buy", ["market-buy-multiplier"]);
  }

  quoteSale(product, quantity, profile) {
    const fullValueKey = FULL_VALUE_CATEGORY_TO_SETTING[product.treasureCategory];
    const isFullValue = fullValueKey && profile.pricing.fullValueTreasure?.[fullValueKey] === true;

    if (isFullValue) {
      return quote(product, quantity, 1, "full-value-treasure", [`treasure-category:${product.treasureCategory}`]);
    }

    return quote(product, quantity, profile.pricing.sellMultiplier, "standard-sell", ["market-sell-multiplier"]);
  }
}

function quote(product, quantity, multiplier, rule, reasons) {
  const baseUnitPrice = assertCopperValue(product.baseUnitPrice, "baseUnitPrice");
  assertQuantity(quantity);
  const unitPrice = multiplyCopper(baseUnitPrice, multiplier);
  const totalPrice = assertCopperValue(unitPrice * quantity, "totalPrice");

  return {
    baseUnitPrice,
    quantity,
    multiplier,
    unitPrice,
    totalPrice,
    rule,
    reasons
  };
}

function assertQuantity(quantity) {
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new TypeError("Quantity must be a positive safe integer.");
  }
}
