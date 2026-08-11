export const MARKET_TABS = Object.freeze(["buy", "spell-items", "sell", "cart"]);

export function initialTabFromMode(mode = "browse") {
  if (mode === "sell") return "sell";
  if (mode === "buy") return "buy";
  return "buy";
}

export function normalizeMarketTab(tab, fallback = "buy") {
  return MARKET_TABS.includes(tab) ? tab : fallback;
}

export function buildTabState(activeTab) {
  const normalized = normalizeMarketTab(activeTab);
  return Object.fromEntries(MARKET_TABS.map((id) => [id, { id, active: id === normalized }]));
}
