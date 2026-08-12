import { createRuntimeId } from "../core/id.js";
import { assertCopperValue } from "../core/money.js";

export class CartService {
  #state = {
    buyLines: [],
    sellLines: [],
    activeDirection: "buy"
  };

  getState() {
    return structuredClone(this.#state);
  }

  setActiveDirection(direction) {
    assertDirection(direction);
    this.#state.activeDirection = direction;
  }

  add({ direction, product, quantity = 1, quote }) {
    assertDirection(direction);
    assertQuantity(quantity);
    assertQuote(quote, quantity);

    const lines = this.#lines(direction);
    const key = productKey(product, direction);
    const existing = lines.find((line) => line.key === key);

    if (existing) {
      existing.quantity += quantity;
      existing.quotedUnitPrice = quote.unitPrice;
      existing.quotedBaseUnitPrice = quote.baseUnitPrice ?? quote.unitPrice;
      existing.quotedMultiplier = quote.multiplier ?? 1;
      existing.quotedStackPrice = quote.stackPrice ?? null;
      existing.quotedPricePer = quote.pricePer ?? 1;
      existing.quotedTotalPrice = lineTotal(existing.quotedBaseUnitPrice, existing.quotedMultiplier, existing.quantity, existing.quotedStackPrice, existing.quotedPricePer);
      return structuredClone(existing);
    }

    const line = {
      id: createRuntimeId(),
      key,
      direction,
      product: structuredClone(product),
      quantity,
      quotedUnitPrice: quote.unitPrice,
      quotedBaseUnitPrice: quote.baseUnitPrice ?? quote.unitPrice,
      quotedMultiplier: quote.multiplier ?? 1,
      quotedStackPrice: quote.stackPrice ?? null,
      quotedPricePer: quote.pricePer ?? 1,
      quotedTotalPrice: quote.totalPrice
    };
    lines.push(line);
    return structuredClone(line);
  }

  setQuantity(direction, lineId, quantity) {
    assertDirection(direction);
    assertQuantity(quantity);
    const line = this.#requireLine(direction, lineId);
    line.quantity = quantity;
    line.quotedTotalPrice = lineTotal(
      line.quotedBaseUnitPrice ?? line.quotedUnitPrice,
      line.quotedMultiplier ?? 1,
      quantity,
      line.quotedStackPrice ?? null,
      line.quotedPricePer ?? 1
    );
    return structuredClone(line);
  }

  remove(direction, lineId) {
    assertDirection(direction);
    const lines = this.#lines(direction);
    const index = lines.findIndex((line) => line.id === lineId);
    if (index < 0) return false;
    lines.splice(index, 1);
    return true;
  }

  clear(direction) {
    assertDirection(direction);
    this.#state[direction === "buy" ? "buyLines" : "sellLines"] = [];
  }

  getQuotedTotal(direction) {
    assertDirection(direction);
    return this.#lines(direction).reduce((sum, line) => sum + line.quotedTotalPrice, 0);
  }

  #lines(direction) {
    return this.#state[direction === "buy" ? "buyLines" : "sellLines"];
  }

  #requireLine(direction, lineId) {
    const line = this.#lines(direction).find((entry) => entry.id === lineId);
    if (!line) throw new RangeError(`Unknown cart line: ${lineId}`);
    return line;
  }
}

export function productKey(product, direction) {
  if (product.kind === "item") {
    if (direction === "sell") {
      if (!product.inventoryItemUuid) throw new TypeError("Sell cart items require inventoryItemUuid.");
      return `sell:item:${product.inventoryItemUuid}`;
    }
    if (!product.sourceUuid) throw new TypeError("Buy cart items require sourceUuid.");
    return `buy:item:${product.sourceUuid}`;
  }

  if (product.kind === "scroll" || product.kind === "wand") {
    if (!product.spellUuid || !Number.isSafeInteger(product.spellRank)) {
      throw new TypeError("Spell products require spellUuid and integer spellRank.");
    }
    return `${direction}:${product.kind}:${product.spellUuid}:${product.spellRank}`;
  }

  throw new TypeError(`Unsupported product kind: ${product.kind}`);
}

function assertDirection(direction) {
  if (!['buy', 'sell'].includes(direction)) throw new TypeError("Direction must be buy or sell.");
}

function assertQuantity(quantity) {
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new TypeError("Quantity must be a positive integer.");
}

function assertQuote(quote, quantity) {
  if (!quote || typeof quote !== "object") throw new TypeError("A price quote is required.");
  assertCopperValue(quote.unitPrice, "quote.unitPrice");
  assertCopperValue(quote.totalPrice, "quote.totalPrice");
  const baseUnitPrice = quote.baseUnitPrice ?? quote.unitPrice;
  const multiplier = quote.multiplier ?? 1;
  assertCopperValue(baseUnitPrice, "quote.baseUnitPrice");
  if (!Number.isFinite(multiplier) || multiplier < 0) throw new TypeError("Quote multiplier must be non-negative.");
  if (quote.totalPrice !== lineTotal(baseUnitPrice, multiplier, quantity, quote.stackPrice ?? null, quote.pricePer ?? 1)) {
    throw new RangeError("Quote total must equal the once-rounded line total.");
  }
}

function lineTotal(baseUnitPrice, multiplier, quantity, stackPrice = null, pricePer = 1) {
  const hasStackPrice = Number.isSafeInteger(stackPrice) && stackPrice >= 0;
  const per = Number.isSafeInteger(pricePer) && pricePer >= 1 ? pricePer : 1;
  const baseLinePrice = hasStackPrice
    ? Math.floor((stackPrice * quantity) / per)
    : baseUnitPrice * quantity;
  return assertCopperValue(Math.round(baseLinePrice * multiplier));
}

