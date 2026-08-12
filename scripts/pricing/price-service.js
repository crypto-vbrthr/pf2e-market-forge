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
  if (!Number.isFinite(multiplier) || multiplier < 0) {
    throw new TypeError("Price multiplier must be a non-negative finite number.");
  }

  // PF2e prices can be expressed as a price for N units (`price.per`). Calculate the
  // base value of the requested stack before applying market multipliers so grouped
  // prices and sub-copper per-unit values retain the same semantics as PF2e Coins.fromPrice.
  const pricePer = normalizePricePer(product.pricePer);
  const stackPrice = normalizeStackPrice(product.stackPrice);
  const baseLinePrice = stackPrice === null
    ? assertCopperValue(baseUnitPrice * quantity, "baseLinePrice")
    : assertCopperValue(Math.floor((stackPrice * quantity) / pricePer), "baseLinePrice");

  // The line total is authoritative and rounded once after the stack value is known.
  // This avoids multiplying a per-unit rounding error across a stack.
  const unitPrice = multiplyCopper(baseUnitPrice, multiplier);
  const totalPrice = assertCopperValue(Math.round(baseLinePrice * multiplier), "totalPrice");

  return {
    baseUnitPrice,
    baseLinePrice,
    stackPrice,
    pricePer,
    quantity,
    multiplier,
    unitPrice,
    totalPrice,
    rule,
    reasons
  };
}

function normalizePricePer(value) {
  const numeric = Number(value ?? 1);
  return Number.isSafeInteger(numeric) && numeric >= 1 ? numeric : 1;
}

function normalizeStackPrice(value) {
  if (value === undefined || value === null) return null;
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : null;
}

function assertQuantity(quantity) {
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new TypeError("Quantity must be a positive safe integer.");
  }
}
