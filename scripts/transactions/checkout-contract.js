const CLIENT_PRICE_KEYS = new Set([
  "price",
  "unitPrice",
  "total",
  "totalPrice",
  "quotedUnitPrice",
  "quotedTotalPrice",
  "baseUnitPrice",
  "multiplier"
]);

export function normalizeCheckoutRequest(request, { requestedByUserId = null } = {}) {
  if (!request || typeof request !== "object") throw new TypeError("Checkout request must be an object.");
  if (!['buy', 'sell'].includes(request.direction)) throw new TypeError("Checkout direction must be buy or sell.");
  if (typeof request.profileId !== "string" || !request.profileId) throw new TypeError("profileId is required.");
  if (typeof request.itemActorUuid !== "string" || !request.itemActorUuid) throw new TypeError("itemActorUuid is required.");
  if (typeof request.currencyActorUuid !== "string" || !request.currencyActorUuid) throw new TypeError("currencyActorUuid is required.");
  const requester = requestedByUserId ?? request.requestedByUserId;
  if (typeof requester !== "string" || !requester) throw new TypeError("requestedByUserId is required.");
  const operationId = request.operationId == null ? null : String(request.operationId).trim();
  if (operationId !== null && !operationId) throw new TypeError("operationId must be a non-empty string when provided.");
  if (!Array.isArray(request.lines) || request.lines.length === 0) throw new RangeError("Checkout requires at least one line.");

  return {
    direction: request.direction,
    profileId: request.profileId,
    itemActorUuid: request.itemActorUuid,
    currencyActorUuid: request.currencyActorUuid,
    requestedByUserId: requester,
    operationId,
    lines: request.lines.map(normalizeCheckoutLine)
  };
}

function normalizeCheckoutLine(line) {
  if (!line || typeof line !== "object") throw new TypeError("Checkout line must be an object.");
  if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) throw new TypeError("Checkout quantity must be a positive integer.");
  if (!line.product || typeof line.product !== "object") throw new TypeError("Checkout line product is required.");

  return {
    product: stripClientPriceFields(line.product),
    quantity: line.quantity
  };
}

function stripClientPriceFields(product) {
  const copy = {};
  for (const [key, value] of Object.entries(product)) {
    if (CLIENT_PRICE_KEYS.has(key)) continue;
    copy[key] = structuredClone(value);
  }
  return copy;
}
