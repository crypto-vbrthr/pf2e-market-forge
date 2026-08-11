import { assertCopperValue } from "../core/money.js";

export function validateTransactionPlan(plan) {
  const errors = [];
  const warnings = [];

  if (!plan || typeof plan !== "object") return { valid: false, errors: ["invalid-plan"], warnings };
  if (!['buy', 'sell'].includes(plan.direction)) errors.push("invalid-direction");
  if (!Array.isArray(plan.lines) || plan.lines.length === 0) errors.push("empty-plan");

  try {
    assertCopperValue(plan.total, "plan.total");
  } catch {
    errors.push("invalid-total");
  }

  let computedTotal = 0;
  for (const line of plan.lines ?? []) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) errors.push("invalid-quantity");
    if (line.availability?.available !== true) errors.push("item-no-longer-available");

    try {
      assertCopperValue(line.price?.totalPrice, "line.price.totalPrice");
      computedTotal += line.price.totalPrice;
    } catch {
      errors.push("invalid-line-price");
    }
  }

  if (Number.isSafeInteger(plan.total) && computedTotal !== plan.total) errors.push("total-mismatch");

  return { valid: errors.length === 0, errors: [...new Set(errors)], warnings };
}
