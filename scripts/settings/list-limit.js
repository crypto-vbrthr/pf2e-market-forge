import { getSetting, SETTINGS } from "./register-settings.js";

export const DEFAULT_MARKET_LIST_LIMIT = 150;
export const MIN_MARKET_LIST_LIMIT = 25;
export const MAX_MARKET_LIST_LIMIT = 500;

export function normalizeMarketListLimit(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_MARKET_LIST_LIMIT;
  return Math.max(MIN_MARKET_LIST_LIMIT, Math.min(MAX_MARKET_LIST_LIMIT, Math.trunc(numeric)));
}

export function readMarketListLimit(getter = getSetting) {
  return normalizeMarketListLimit(getter(SETTINGS.MARKET_LIST_LIMIT, DEFAULT_MARKET_LIST_LIMIT));
}
