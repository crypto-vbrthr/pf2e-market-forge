import { CatalogService } from "../catalog/catalog-service.js";
import { ItemPreviewService } from "../catalog/preview-service.js";
import { MODULE_ID } from "../core/constants.js";
import { copperToCoins } from "../core/money.js";
import { resolveMarketMaximumForActor } from "../market/market-level-context.js";
import { createDefaultMarketProfile } from "../market/profile-defaults.js";
import { createCatalogViewState, toggleExpandedUuid, updateCatalogViewState } from "./catalog-view-state.js";
import { buildTabState, initialTabFromMode, normalizeMarketTab } from "./market-window-state.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class MarketApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-window`,
    classes: [MODULE_ID, "market-forge-window"],
    position: {
      width: 1040,
      height: 760
    },
    window: {
      icon: "fa-solid fa-coins",
      resizable: true,
      title: "PF2E_MARKET_FORGE.Name"
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/market.hbs`
    }
  };

  #actor;
  #launchOptions;
  #activeTab;
  #profile;
  #catalogService;
  #previewService;
  #catalogFilters = createCatalogViewState();
  #expandedItems = new Set();
  #previews = new Map();
  #previewErrors = new Map();
  #searchTimer = null;

  constructor({ actor, launchOptions = {}, profile = null, catalogService = null, previewService = null } = {}) {
    super();
    this.#actor = actor ?? null;
    this.#launchOptions = structuredClone(launchOptions);
    this.#activeTab = initialTabFromMode(launchOptions.initialMode);
    this.#profile = profile ?? createDefaultMarketProfile();
    this.#catalogService = catalogService ?? new CatalogService();
    this.#previewService = previewService ?? new ItemPreviewService();
  }

  get actor() {
    return this.#actor;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.#actor;
    const tabs = buildTabState(this.#activeTab);
    const levelContext = resolveMarketMaximumForActor(this.#profile, actor, {
      activeParty: globalThis.game?.actors?.party ?? null
    });
    const maximumItemLevel = levelContext.result?.maximumItemLevel ?? null;

    let catalog = emptyCatalogResult();
    if (tabs.buy.active) {
      catalog = await this.#catalogService.search({
        profile: this.#profile,
        maximumItemLevel,
        filters: this.#catalogFilters,
        limit: 150
      });
    }

    const preparedEntries = catalog.entries.map((entry) => this.#prepareCatalogEntry(entry));

    return Object.assign(context, {
      actor: actor ? {
        uuid: actor.uuid,
        name: actor.name,
        img: actor.img,
        type: actor.type,
        typeLabel: this.#actorTypeLabel(actor.type),
        currency: this.#currencyLabel(actor)
      } : null,
      profile: {
        id: this.#profile.id,
        name: this.#profile.id === "default"
          ? game.i18n.localize("PF2E_MARKET_FORGE.DefaultMarket")
          : this.#profile.name,
        levelMode: game.i18n.localize(`PF2E_MARKET_FORGE.LevelMode.${this.#profile.availability.levelLimit.mode}`),
        offset: this.#profile.availability.levelLimit.offset,
        maximumItemLevel,
        maximumItemLevelLabel: maximumItemLevel === null
          ? game.i18n.localize("PF2E_MARKET_FORGE.Unlimited")
          : String(maximumItemLevel)
      },
      tabs,
      buyTab: tabs.buy,
      spellItemsTab: tabs["spell-items"],
      sellTab: tabs.sell,
      cartTab: tabs.cart,
      inventoryCount: this.#physicalItemCount(actor),
      milestone: "2",
      readOnlyMilestone: true,
      catalog: {
        ...catalog,
        entries: preparedEntries,
        hasEntries: preparedEntries.length > 0,
        resultLabel: this.#catalogResultLabel(preparedEntries.length, catalog.total, catalog.truncated),
        sourceWarnings: catalog.sources.filter((source) => source.status !== "ready")
      },
      catalogFilters: this.#catalogFilters,
      catalogOptions: this.#catalogOptions(catalog.facets),
      marketLevelContext: {
        partyName: levelContext.party?.name ?? null,
        memberLevels: levelContext.memberLevels.join(", ")
      }
    });
  }

  async _onRender(context, options) {
    await super._onRender(context, options);

    for (const button of this.element.querySelectorAll("[data-market-tab]")) {
      button.addEventListener("click", () => {
        this.#activeTab = normalizeMarketTab(button.dataset.marketTab, this.#activeTab);
        this.render();
      });
    }

    const search = this.element.querySelector("[data-catalog-filter='search']");
    search?.addEventListener("input", (event) => {
      clearTimeout(this.#searchTimer);
      const value = event.currentTarget.value;
      this.#searchTimer = setTimeout(() => {
        this.#catalogFilters = updateCatalogViewState(this.#catalogFilters, "search", value);
        this.render();
      }, 220);
    });

    for (const select of this.element.querySelectorAll("select[data-catalog-filter]")) {
      select.addEventListener("change", (event) => {
        const field = event.currentTarget.dataset.catalogFilter;
        this.#catalogFilters = updateCatalogViewState(this.#catalogFilters, field, event.currentTarget.value);
        this.render();
      });
    }

    for (const button of this.element.querySelectorAll("[data-market-expand-item]")) {
      button.addEventListener("click", async () => {
        const uuid = button.dataset.marketExpandItem;
        await this.#togglePreview(uuid);
      });
    }

    for (const button of this.element.querySelectorAll("[data-market-open-item]")) {
      button.addEventListener("click", async () => {
        const uuid = button.dataset.marketOpenItem;
        try {
          await this.#previewService.openSheet(uuid);
        } catch (error) {
          console.error(`${MODULE_ID} | Could not open item sheet`, uuid, error);
          ui.notifications?.error?.(game.i18n.localize("PF2E_MARKET_FORGE.Errors.ItemOpenFailed"));
        }
      });
    }

    this.#activateEnrichedContent();
  }

  async #togglePreview(uuid) {
    if (!uuid) return;

    this.#expandedItems = toggleExpandedUuid(this.#expandedItems, uuid);
    this.#previewErrors.delete(uuid);

    if (this.#expandedItems.has(uuid) && !this.#previews.has(uuid)) {
      try {
        const preview = await this.#previewService.getPreview(uuid);
        this.#previews.set(uuid, preview);
      } catch (error) {
        console.error(`${MODULE_ID} | Failed to load item preview`, uuid, error);
        this.#previewErrors.set(uuid, error instanceof Error ? error.message : String(error));
      }
    }

    await this.render();
  }

  #prepareCatalogEntry(entry) {
    const preview = this.#previews.get(entry.uuid) ?? null;
    const expanded = this.#expandedItems.has(entry.uuid);
    const availabilityReasons = entry.availability.reasons.map((reason) =>
      this.#availabilityReasonLabel(reason, entry.availability.marketMaximumLevel)
    );

    return {
      ...entry,
      priceLabel: this.#formatCopper(entry.baseUnitPrice),
      rarityLabel: game.i18n.localize(`PF2E_MARKET_FORGE.Rarity.${entry.rarity}`),
      typeLabel: this.#itemTypeLabel(entry.itemType),
      expanded,
      preview: preview ? {
        ...preview,
        traitLabels: preview.traits.map((trait) => this.#traitLabel(trait))
      } : null,
      previewError: this.#previewErrors.get(entry.uuid) ?? null,
      available: entry.availability.available,
      availabilityReasons,
      availabilityReasonText: availabilityReasons.join(" · ")
    };
  }

  #catalogOptions(facets) {
    return {
      categories: facets.categories.map((value) => ({
        value,
        label: this.#itemTypeLabel(value),
        selected: this.#catalogFilters.category === value
      })),
      levels: facets.levels.map((value) => ({
        value: String(value),
        label: String(value),
        selected: String(this.#catalogFilters.level) === String(value)
      })),
      rarities: ["common", "uncommon", "rare", "unique"]
        .filter((value) => facets.rarities.includes(value))
        .map((value) => ({
          value,
          label: game.i18n.localize(`PF2E_MARKET_FORGE.Rarity.${value}`),
          selected: this.#catalogFilters.rarity === value
        })),
      sources: facets.sources.map((source) => ({
        ...source,
        selected: this.#catalogFilters.sourcePack === source.id
      }))
    };
  }

  #catalogResultLabel(visible, total, truncated) {
    if (!truncated) {
      return game.i18n.format("PF2E_MARKET_FORGE.Buy.Results", { count: total });
    }
    return game.i18n.format("PF2E_MARKET_FORGE.Buy.ResultsTruncated", { visible, total });
  }

  #availabilityReasonLabel(reason, maximumItemLevel) {
    if (reason === "level-too-high") {
      return game.i18n.format("PF2E_MARKET_FORGE.Availability.LevelTooHigh", {
        level: maximumItemLevel ?? "—"
      });
    }
    return game.i18n.localize(`PF2E_MARKET_FORGE.Availability.${reason}`);
  }

  #itemTypeLabel(type) {
    const coreKey = globalThis.CONFIG?.Item?.typeLabels?.[type];
    if (coreKey) {
      const localized = game.i18n.localize(coreKey);
      if (localized !== coreKey) return localized;
    }

    const ownKey = `PF2E_MARKET_FORGE.ItemType.${type}`;
    const ownLabel = game.i18n.localize(ownKey);
    return ownLabel === ownKey ? type : ownLabel;
  }

  #traitLabel(trait) {
    const labels = globalThis.CONFIG?.PF2E?.traits ?? globalThis.CONFIG?.PF2E?.itemTraits ?? {};
    const key = labels?.[trait];
    if (key) {
      const localized = game.i18n.localize(key);
      if (localized !== key) return localized;
    }
    return trait;
  }

  #activateEnrichedContent() {
    const root = this.element.querySelector(".market-forge-catalog-list");
    if (!root) return;

    try {
      globalThis.game?.pf2e?.system?.bindDragDropListeners?.(root);
    } catch (_error) {
      // Enriched inline links remain usable even when no optional PF2e binder is exposed.
    }
  }

  #physicalItemCount(actor) {
    const contents = actor?.inventory?.contents;
    if (!contents) return 0;
    return Array.from(contents).length;
  }

  #currencyLabel(actor) {
    const coins = actor?.inventory?.coins;
    if (coins && typeof coins.toString === "function") {
      try {
        return coins.toString({ decimal: true });
      } catch (_error) {
        // Fall through to denomination formatting.
      }
    }

    const currency = actor?.inventory?.currency;
    if (!currency) return game.i18n.localize("PF2E_MARKET_FORGE.NotAvailable");

    const labels = [
      ["pp", game.i18n.localize("PF2E_MARKET_FORGE.Coins.pp")],
      ["gp", game.i18n.localize("PF2E_MARKET_FORGE.Coins.gp")],
      ["sp", game.i18n.localize("PF2E_MARKET_FORGE.Coins.sp")],
      ["cp", game.i18n.localize("PF2E_MARKET_FORGE.Coins.cp")]
    ];
    const parts = labels
      .map(([key, label]) => [Number(currency[key] ?? 0), label])
      .filter(([value]) => value > 0)
      .map(([value, label]) => `${value} ${label}`);
    return parts.join(" ") || `0 ${game.i18n.localize("PF2E_MARKET_FORGE.Coins.gp")}`;
  }

  #formatCopper(value) {
    const coins = copperToCoins(value);
    const parts = [
      [coins.pp, "pp"],
      [coins.gp, "gp"],
      [coins.sp, "sp"],
      [coins.cp, "cp"]
    ]
      .filter(([amount]) => amount > 0)
      .map(([amount, denomination]) => `${amount} ${game.i18n.localize(`PF2E_MARKET_FORGE.Coins.${denomination}`)}`);
    return parts.join(" ") || `0 ${game.i18n.localize("PF2E_MARKET_FORGE.Coins.cp")}`;
  }

  #actorTypeLabel(type) {
    const key = type === "party" ? "PF2E_MARKET_FORGE.ActorType.Party" : "PF2E_MARKET_FORGE.ActorType.Character";
    return game.i18n.localize(key);
  }
}

function emptyCatalogResult() {
  return {
    entries: [],
    total: 0,
    truncated: false,
    facets: { categories: [], levels: [], rarities: [], sources: [] },
    sources: []
  };
}
