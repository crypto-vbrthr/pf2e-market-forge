import { assertCopperValue } from "../core/money.js";

export function validateTransactionPlan(plan, { availableBalance = null } = {}) {
  const errors = [];
  const warnings = [];

  if (!plan || typeof plan !== "object") return { valid: false, errors: ["invalid-plan"], warnings };
  if (!["buy", "sell"].includes(plan.direction)) errors.push("invalid-direction");
  if (!Array.isArray(plan.lines) || plan.lines.length === 0) errors.push("empty-plan");

  try {
    assertCopperValue(plan.total, "plan.total");
  } catch {
    errors.push("invalid-total");
  }

  let computedTotal = 0;
  for (const line of plan.lines ?? []) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) errors.push("invalid-quantity");
    if (line.availability?.available !== true) {
      if (line.availability?.reasons?.includes?.("insufficient-quantity")) errors.push("insufficient-quantity");
      else errors.push("item-no-longer-available");
    }

    if (plan.direction === "sell") {
      const availableQuantity = Number(line.resolvedProduct?.availableQuantity);
      if (Number.isSafeInteger(availableQuantity) && line.quantity > availableQuantity) errors.push("insufficient-quantity");
    }

    try {
      assertCopperValue(line.price?.totalPrice, "line.price.totalPrice");
      computedTotal += line.price.totalPrice;
    } catch {
      errors.push("invalid-line-price");
    }
  }

  if (Number.isSafeInteger(plan.total) && computedTotal !== plan.total) errors.push("total-mismatch");

  let remainingBalance = null;
  if (availableBalance !== null) {
    try {
      assertCopperValue(availableBalance, "availableBalance");
      const total = Number.isSafeInteger(plan.total) ? plan.total : 0;
      remainingBalance = plan.direction === "sell" ? availableBalance + total : availableBalance - total;
      if (plan.direction === "buy" && remainingBalance < 0) errors.push("insufficient-funds");
    } catch {
      errors.push("invalid-balance");
    }
  }

  const result = {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    warnings
  };
  if (availableBalance !== null) {
    result.availableBalance = availableBalance;
    result.remainingBalance = remainingBalance;
  }
  return result;
}
