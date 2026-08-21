export const CITY_FORGE_MODULE_ID = "pf2e-city-forge";
export const AVAILABILITY_PROVIDER_TYPES = Object.freeze(["manual", "city-forge"]);

export class CityForgeProvider {
  #moduleProvider;

  constructor({ moduleProvider = defaultModuleProvider } = {}) {
    this.#moduleProvider = moduleProvider;
  }

  getStatus() {
    const module = this.#moduleProvider();
    const api = module?.api ?? null;
    const available = Boolean(
      module?.active &&
      api?.version >= 1 &&
      api?.capabilities?.economy === true &&
      typeof api?.economy?.evaluateContext === "function"
    );

    return {
      available,
      active: Boolean(module?.active),
      apiVersion: Number(api?.version ?? 0),
      hasMarketSources: Boolean(api?.capabilities?.marketSources),
      reason: available ? null : "city-forge-unavailable"
    };
  }

  async listSources() {
    const module = this.#moduleProvider();
    const api = module?.api;
    if (!this.getStatus().available) return [];

    if (typeof api?.economy?.getSources === "function") {
      const sources = await api.economy.getSources();
      return Array.isArray(sources) ? sources.map((source) => structuredClone(source)) : [];
    }

    // Compatibility fallback for City Forge 0.3.x.
    const settlements = await api.settlements.list();
    const sources = [];
    for (const settlement of settlements ?? []) {
      const markets = await api.economy.getMarkets(settlement.id);
      for (const market of markets ?? []) {
        sources.push({
          id: `${settlement.id}::${market.id}`,
          settlementId: settlement.id,
          marketId: market.id,
          settlementName: settlement.definition?.identity?.name ?? settlement.id,
          settlementLevel: settlement.definition?.identity?.level ?? 0,
          settlementType: settlement.definition?.identity?.type ?? "",
          marketName: market.name ?? null,
          marketLabel: market.name || localize("PF2E_MARKET_FORGE.CityForge.DefaultMarket", "General Market"),
          virtual: market.virtual === true,
          revision: settlement.revision ?? 1,
          label: `${settlement.definition?.identity?.name ?? settlement.id} · ${market.name || localize("PF2E_MARKET_FORGE.CityForge.DefaultMarket", "General Market")}`
        });
      }
    }
    return sources;
  }

  async createSession(profile) {
    const config = normalizeAvailabilityProvider(profile);
    if (config.type !== "city-forge") {
      return Object.freeze({
        type: "manual",
        active: false,
        connected: true,
        sourceId: null,
        source: null,
        context: null,
        reason: null
      });
    }

    const status = this.getStatus();
    if (!status.available) return disconnected(config.sourceId, "city-forge-unavailable");
    if (!config.sourceId) return disconnected(null, "city-forge-source-missing");

    const module = this.#moduleProvider();
    const api = module.api;

    try {
      let source = null;
      let context = null;

      if (typeof api.economy.getSource === "function") {
        source = await api.economy.getSource(config.sourceId);
      }

      if (typeof api.economy.getContextForSource === "function") {
        context = await api.economy.getContextForSource(config.sourceId);
      } else {
        const parsed = parseSourceId(config.sourceId);
        if (parsed) {
          const settlement = await api.settlements.get(parsed.settlementId);
          if (settlement) {
            source = source ?? {
              id: config.sourceId,
              settlementId: parsed.settlementId,
              marketId: parsed.marketId,
              settlementName: settlement.definition?.identity?.name ?? parsed.settlementId,
              settlementLevel: settlement.definition?.identity?.level ?? 0,
              settlementType: settlement.definition?.identity?.type ?? "",
              marketLabel: parsed.marketId === "default"
                ? localize("PF2E_MARKET_FORGE.CityForge.DefaultMarket", "General Market")
                : parsed.marketId,
              label: settlement.definition?.identity?.name ?? parsed.settlementId,
              revision: settlement.revision ?? 1
            };
            context = await api.economy.getContext(parsed.settlementId, { marketId: parsed.marketId });
          }
        }
      }

      if (!context) return disconnected(config.sourceId, "city-forge-source-not-found");

      source ??= {
        id: config.sourceId,
        settlementId: context.settlement?.id ?? null,
        marketId: context.market?.id ?? "default",
        settlementName: context.settlement?.name ?? "",
        settlementLevel: context.settlement?.level ?? 0,
        settlementType: context.settlement?.type ?? "",
        marketLabel: context.market?.name || localize("PF2E_MARKET_FORGE.CityForge.DefaultMarket", "General Market"),
        label: context.settlement?.name ?? config.sourceId,
        revision: context.provenance?.revision ?? 1
      };

      const session = {
        type: "city-forge",
        active: true,
        connected: true,
        sourceId: config.sourceId,
        source: structuredClone(source),
        context,
        reason: null,
        evaluateEntry(entry, { sourceKind = "item", level = undefined } = {}) {
          const subject = mapMarketSubject(entry, { sourceKind, level });
          const evaluation = api.economy.evaluateContext(context, subject);
          return {
            connected: true,
            source: structuredClone(source),
            evaluation
          };
        }
      };

      return Object.freeze(session);
    } catch (error) {
      console.warn?.("pf2e-market-forge | City Forge provider session failed", error);
      return disconnected(config.sourceId, "city-forge-provider-error");
    }
  }
}

export function normalizeAvailabilityProvider(profile) {
  const raw = profile?.availability?.provider;
  const type = raw?.type === "city-forge" ? "city-forge" : "manual";
  return {
    type,
    sourceId: type === "city-forge" && typeof raw?.sourceId === "string" ? raw.sourceId : ""
  };
}

export function isCityForgeAvailability(profile) {
  return normalizeAvailabilityProvider(profile).type === "city-forge";
}

export function mapMarketSubject(entry = {}, { sourceKind = "item", level = undefined } = {}) {
  return {
    uuid: entry.uuid ?? entry.sourceUuid ?? "",
    sourceKind,
    itemType: entry.itemType ?? entry.type ?? "",
    category: entry.category ?? "",
    group: entry.group ?? "",
    level: level === undefined
      ? (sourceKind === "spell" ? null : entry.level ?? entry.itemLevel ?? null)
      : level,
    rarity: entry.rarity ?? "common",
    traits: Array.isArray(entry.traits) ? [...entry.traits] : [],
    traditions: Array.isArray(entry.traditions) ? [...entry.traditions] : [],
    slug: entry.slug ?? ""
  };
}

export function parseSourceId(sourceId) {
  if (typeof sourceId !== "string") return null;
  const index = sourceId.lastIndexOf("::");
  if (index <= 0) return null;
  return {
    settlementId: sourceId.slice(0, index),
    marketId: sourceId.slice(index + 2) || "default"
  };
}

function disconnected(sourceId, reason) {
  return Object.freeze({
    type: "city-forge",
    active: true,
    connected: false,
    sourceId: sourceId || null,
    source: null,
    context: null,
    reason,
    evaluateEntry() {
      return { connected: false, source: null, evaluation: null, reason };
    }
  });
}

function defaultModuleProvider() {
  return globalThis.game?.modules?.get?.(CITY_FORGE_MODULE_ID) ?? null;
}

function localize(key, fallback) {
  const value = globalThis.game?.i18n?.localize?.(key);
  return value && value !== key ? value : fallback;
}
