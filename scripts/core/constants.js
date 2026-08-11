export const MODULE_ID = "pf2e-market-forge";
export const API_VERSION = 1;
export const PROFILE_SCHEMA_VERSION = 1;

export const RARITIES = Object.freeze(["common", "uncommon", "rare", "unique"]);
export const LEVEL_LIMIT_MODES = Object.freeze([
  "fixed",
  "party-average",
  "party-highest",
  "party-lowest",
  "unlimited"
]);
export const LEVEL_ROUNDING = Object.freeze(["floor", "round", "ceil"]);
export const MARKET_MODES = Object.freeze(["buy", "sell", "browse"]);
export const PRODUCT_KINDS = Object.freeze(["item", "scroll", "wand"]);
