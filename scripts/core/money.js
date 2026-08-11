export function assertCopperValue(value, label = "CopperValue") {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer.`);
  }
  return value;
}

export function coinsToCopper({ pp = 0, gp = 0, sp = 0, cp = 0 } = {}) {
  for (const [name, value] of Object.entries({ pp, gp, sp, cp })) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new TypeError(`${name} must be a non-negative safe integer.`);
    }
  }

  return assertCopperValue(pp * 1000 + gp * 100 + sp * 10 + cp);
}

export function copperToCoins(value) {
  assertCopperValue(value);
  let remainder = value;
  const pp = Math.floor(remainder / 1000);
  remainder %= 1000;
  const gp = Math.floor(remainder / 100);
  remainder %= 100;
  const sp = Math.floor(remainder / 10);
  const cp = remainder % 10;
  return { pp, gp, sp, cp };
}

export function multiplyCopper(value, multiplier) {
  assertCopperValue(value);
  if (!Number.isFinite(multiplier) || multiplier < 0) {
    throw new TypeError("Price multiplier must be a non-negative finite number.");
  }
  return assertCopperValue(Math.round(value * multiplier));
}
