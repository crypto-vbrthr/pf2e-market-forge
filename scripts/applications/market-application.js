import { CartService } from "../cart/cart-service.js";
import { CatalogService } from "../catalog/catalog-service.js";
import { ItemPreviewService } from "../catalog/preview-service.js";
import { MODULE_ID } from "../core/constants.js";
import { resolveMarketMaximumForActor } from "../market/market-level-context.js";
import { createDefaultMarketProfile } from "../market/profile-defaults.js";
import { CurrencyAdapter } from "../pf2e/currency-adapter.js";
import { InventoryAdapter } from "../pf2e/inventory-adapter.js";
import { ReceiptService } from "../receipts/receipt-service.js";
import { PriceService } from "../pricing/price-service.js";
import { TransactionService } from "../transactions/transaction-service.js";
import { createCatalogViewState, toggleExpandedUuid, updateCatalogViewState } from "./catalog-view-state.js";
import { buildTabState, initialTabFromMode, normalizeMarketTab } from "./market-window-state.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class MarketApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-window`,
    classes: [MODULE_ID, "market-forge-window"],
    position: {
      width: 1080,
      height: 780
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
  #cartService;
  #priceService;
  #currencyAdapter;
  #inventoryAdapter;
  #receiptService;
  #transactionService;
  #catalogFilters = createCatalogViewState();
  #expandedItems = new Set();
  #previews = new Map();
  #previewErrors = new Map();
  #checkoutState = null;
  #checkoutBusy = false;
  #searchTimer = null;

  constructor({
    actor,
    launchOptions = {},
    profile = null,
    catalogService = null,
    previewService = null,
    cartService = null,
    priceService = null,
    currencyAdapter = null,
    inventoryAdapter = null,
    receiptService = null,
    transactionService = null
  } = {}) {
    super();
    this.#actor = actor ?? null;
    this.#launchOptions = structuredClone(launchOptions);
    this.#activeTab = initialTabFromMode(launchOptions.initialMode);
    this.#profile = profile ?? createDefaultMarketProfile();
    this.#catalogService = catalogService ?? new CatalogService();
    this.#previewService = previewService ?? new ItemPreviewService();
    this.#cartService = cartService ?? new CartService();
    this.#priceService = priceService ?? new PriceService();
    const actorProvider = async (uuid) => {
      if (this.#actor?.uuid === uuid) return this.#actor;
      return typeof globalThis.fromUuid === "function" ? globalThis.fromUuid(uuid) : null;
    };
    this.#currencyAdapter = currencyAdapter ?? new CurrencyAdapter({ actorProvider });
    this.#inventoryAdapter = inventoryAdapter ?? new InventoryAdapter({ actorProvider });
    this.#receiptService = receiptService ?? new ReceiptService({ actorProvider });
    this.#transactionService = transactionService ?? new TransactionService({
      profileProvider: async (profileId) => profileId === this.#profile.id ? this.#profile : null,
      productResolver: async (product, { profile, maximumItemLevel, authoritative }) => {
        if (product.kind !== "item") return null;
        return this.#catalogService.getEntry(product.sourceUuid, { profile, maximumItemLevel, fresh: authoritative });
      },
      priceService: this.#priceService,
      balanceProvider: async (actorUuid) => this.#currencyAdapter.getBalance(actorUuid),
      currencyAdapter: this.#currencyAdapter,
      inventoryAdapter: this.#inventoryAdapter,
      receiptService: this.#receiptService,
      permissionProvider: async ({ userId, itemActorUuid, currencyActorUuid }) => {
        const user = globalThis.game?.users?.get?.(userId) ?? globalThis.game?.user ?? null;
        if (!user) return false;
        const itemActor = await actorProvider(itemActorUuid);
        const currencyActor = itemActorUuid === currencyActorUuid ? itemActor : await actorProvider(currencyActorUuid);
        return Boolean(
          itemActor?.canUserModify?.(user, "update") &&
          currencyActor?.canUserModify?.(user, "update")
        );
      }
    });
  }

  get actor() {
    return this.#actor;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.#actor;
    const tabs = buildTabState(this.#activeTab);
    const levelContext = this.#resolveLevelContext();
    const maximumItemLevel = levelContext.result?.maximumItemLevel ?? null;
    const balance = actor ? await this.#safeBalance(actor.uuid) : 0;

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
    const cartState = this.#cartService.getState();
    const buyLines = cartState.buyLines.map((line) => this.#prepareCartLine(line));
    const cartCount = cartState.buyLines.reduce((sum, line) => sum + line.quantity, 0);
    const quotedTotal = this.#cartService.getQuotedTotal("buy");
    const affordable = balance >= quotedTotal;
    const remaining = affordable ? balance - quotedTotal : 0;
    const deficit = affordable ? 0 : quotedTotal - balance;

    return Object.assign(context, {
      actor: actor ? {
        uuid: actor.uuid,
        name: actor.name,
        img: actor.img,
        type: actor.type,
        typeLabel: this.#actorTypeLabel(actor.type),
        currency: this.#formatCopper(balance)
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
      milestone: "4",
      readOnlyMilestone: false,
      catalog: {
        ...catalog,
        entries: preparedEntries,
        hasEntries: preparedEntries.length > 0,
        resultLabel: this.#catalogResultLabel(preparedEntries.length, catalog.total, catalog.truncated),
        sourceWarnings: catalog.sources.filter((source) => source.status !== "ready")
      },
      catalogFilters: this.#catalogFilters,
      catalogOptions: this.#catalogOptions(catalog.facets),
      cart: {
        lines: buyLines,
        hasLines: buyLines.length > 0,
        count: cartCount,
        lineCount: buyLines.length,
        quotedTotal,
        quotedTotalLabel: this.#formatCopper(quotedTotal),
        balance,
        balanceLabel: this.#formatCopper(balance),
        affordable,
        remainingLabel: this.#formatCopper(remaining),
        deficitLabel: this.#formatCopper(deficit),
        itemActorName: actor?.name ?? game.i18n.localize("PF2E_MARKET_FORGE.NotAvailable"),
        currencyActorName: actor?.name ?? game.i18n.localize("PF2E_MARKET_FORGE.NotAvailable"),
        canDryRun: Boolean(actor && buyLines.length && !this.#checkoutBusy),
        canCheckout: Boolean(actor && buyLines.length && affordable && !this.#checkoutBusy)
      },
      checkout: this.#prepareCheckoutState(),
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

    for (const button of this.element.querySelectorAll("[data-market-add-item]")) {
      button.addEventListener("click", async () => this.#addCatalogItem(button.dataset.marketAddItem));
    }

    for (const button of this.element.querySelectorAll("[data-cart-adjust-line]")) {
      button.addEventListener("click", () => {
        const lineId = button.dataset.cartAdjustLine;
        const delta = Number(button.dataset.delta ?? 0);
        const state = this.#cartService.getState();
        const line = state.buyLines.find((entry) => entry.id === lineId);
        if (!line || !Number.isSafeInteger(delta)) return;
        this.#cartService.setQuantity("buy", lineId, Math.max(1, line.quantity + delta));
        this.#cartChanged();
        this.render();
      });
    }

    for (const input of this.element.querySelectorAll("[data-cart-quantity-line]")) {
      input.addEventListener("change", () => {
        const lineId = input.dataset.cartQuantityLine;
        const quantity = Math.max(1, Math.min(999, Math.trunc(Number(input.value) || 1)));
        this.#cartService.setQuantity("buy", lineId, quantity);
        this.#cartChanged();
        this.render();
      });
    }

    for (const button of this.element.querySelectorAll("[data-cart-remove-line]")) {
      button.addEventListener("click", () => {
        this.#cartService.remove("buy", button.dataset.cartRemoveLine);
        this.#cartChanged();
        this.render();
      });
    }

    this.element.querySelector("[data-cart-clear]")?.addEventListener("click", () => {
      this.#cartService.clear("buy");
      this.#cartChanged();
      this.render();
    });

    this.element.querySelector("[data-market-dry-run]")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await this.#runCheckoutDryRun();
      } finally {
        button.disabled = false;
      }
    });

    this.element.querySelector("[data-market-checkout]")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await this.#runCheckout();
      } finally {
        if (button.isConnected) button.disabled = false;
      }
    });

    this.#activateEnrichedContent();
  }

  async #addCatalogItem(uuid) {
    if (!uuid) return;
    const quantityInput = Array.from(this.element.querySelectorAll("[data-market-quantity]")).find(
      (input) => input.dataset.marketQuantity === uuid
    );
    const quantity = Math.max(1, Math.min(999, Math.trunc(Number(quantityInput?.value) || 1)));
    const maximumItemLevel = this.#resolveLevelContext().result?.maximumItemLevel ?? null;
    const entry = await this.#catalogService.getEntry(uuid, { profile: this.#profile, maximumItemLevel });
    if (!entry?.availability?.available) {
      ui.notifications?.warn?.(game.i18n.localize("PF2E_MARKET_FORGE.Errors.ItemUnavailable"));
      return;
    }

    const quote = this.#priceService.quotePurchase(entry, quantity, this.#profile);
    this.#cartService.add({
      direction: "buy",
      quantity,
      quote,
      product: {
        kind: "item",
        sourceUuid: entry.uuid,
        name: entry.name,
        img: entry.img,
        level: entry.level
      }
    });
    this.#cartChanged();
    ui.notifications?.info?.(game.i18n.format("PF2E_MARKET_FORGE.Cart.Added", { quantity, name: entry.name }));
    await this.render();
  }

  async #runCheckoutDryRun() {
    const actor = this.#actor;
    const state = this.#cartService.getState();
    if (!actor || state.buyLines.length === 0) return;

    const request = this.#buildCheckoutRequest(state.buyLines);

    try {
      const maximumItemLevel = this.#resolveLevelContext().result?.maximumItemLevel ?? null;
      const { plan, validation } = await this.#transactionService.dryRun(request, { maximumItemLevel });
      this.#checkoutState = {
        status: validation.valid ? "valid" : "invalid",
        total: plan.total,
        balance: validation.availableBalance ?? 0,
        remaining: validation.remainingBalance ?? null,
        errors: validation.errors
      };
    } catch (error) {
      console.error(`${MODULE_ID} | Checkout dry run failed`, error);
      this.#checkoutState = {
        status: "error",
        total: 0,
        balance: await this.#safeBalance(actor.uuid),
        remaining: null,
        errors: [error instanceof Error ? error.message : String(error)]
      };
    }

    await this.render();
  }

  async #runCheckout() {
    if (this.#checkoutBusy) return;
    const actor = this.#actor;
    const state = this.#cartService.getState();
    if (!actor || state.buyLines.length === 0) return;

    this.#checkoutBusy = true;
    const request = this.#buildCheckoutRequest(state.buyLines);
    this.#checkoutState = { status: "running", total: this.#cartService.getQuotedTotal("buy"), balance: await this.#safeBalance(actor.uuid), remaining: null, errors: [] };
    await this.render();

    try {
      const maximumItemLevel = this.#resolveLevelContext().result?.maximumItemLevel ?? null;
      const result = await this.#transactionService.checkout(request, { maximumItemLevel });
      const balance = await this.#safeBalance(actor.uuid);

      if (result.status === "completed") {
        this.#cartService.clear("buy");
        this.#checkoutState = {
          status: "completed",
          total: result.total,
          balance,
          remaining: result.remainingBalance ?? balance,
          errors: [],
          warnings: result.warnings ?? [],
          transactionId: result.transactionId
        };
        ui.notifications?.info?.(game.i18n.format("PF2E_MARKET_FORGE.Cart.PurchaseSuccess", { total: this.#formatCopper(result.total) }));
      } else {
        this.#checkoutState = {
          status: result.status,
          total: result.total ?? 0,
          balance,
          remaining: result.remainingBalance ?? null,
          errors: result.errors ?? ["transaction-error"],
          warnings: result.warnings ?? [],
          transactionId: result.transactionId ?? null,
          cause: result.cause ?? null
        };
        const key = result.status === "rollback-failed"
          ? "PF2E_MARKET_FORGE.Cart.RollbackFailedNotification"
          : "PF2E_MARKET_FORGE.Cart.PurchaseFailedNotification";
        ui.notifications?.error?.(game.i18n.localize(key));
      }
    } catch (error) {
      console.error(`${MODULE_ID} | Purchase checkout failed`, error);
      this.#checkoutState = {
        status: "error",
        total: 0,
        balance: await this.#safeBalance(actor.uuid),
        remaining: null,
        errors: ["transaction-error"],
        warnings: [],
        cause: error instanceof Error ? error.message : String(error)
      };
      ui.notifications?.error?.(game.i18n.localize("PF2E_MARKET_FORGE.Cart.PurchaseFailedNotification"));
    } finally {
      this.#checkoutBusy = false;
    }

    await this.render();
  }

  #buildCheckoutRequest(lines) {
    const actor = this.#actor;
    return {
      direction: "buy",
      profileId: this.#profile.id,
      itemActorUuid: actor.uuid,
      currencyActorUuid: actor.uuid,
      requestedByUserId: globalThis.game?.user?.id ?? "unknown-user",
      lines: lines.map((line) => ({
        product: structuredClone(line.product),
        quantity: line.quantity
      }))
    };
  }

  #cartChanged() {
    this.#checkoutState = null;
  }

  #prepareCheckoutState() {
    const state = this.#checkoutState;
    if (!state) return null;
    const errorLabels = state.errors.map((error) => this.#transactionErrorLabel(error));
    const remaining = Number.isSafeInteger(state.remaining) ? state.remaining : null;
    return {
      ...state,
      valid: state.status === "valid",
      invalid: state.status === "invalid" || state.status === "failed",
      error: state.status === "error",
      running: state.status === "running",
      completed: state.status === "completed",
      rolledBack: state.status === "rolled-back",
      rollbackFailed: state.status === "rollback-failed",
      totalLabel: this.#formatCopper(Math.max(0, state.total ?? 0)),
      balanceLabel: this.#formatCopper(Math.max(0, state.balance ?? 0)),
      remainingLabel: remaining !== null && remaining >= 0 ? this.#formatCopper(remaining) : null,
      deficitLabel: remaining !== null && remaining < 0 ? this.#formatCopper(Math.abs(remaining)) : null,
      errorLabels,
      warningLabels: (state.warnings ?? []).map((warning) => this.#transactionWarningLabel(warning))
    };
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
    const quote = this.#priceService.quotePurchase(entry, 1, this.#profile);

    return {
      ...entry,
      priceLabel: this.#formatCopper(quote.unitPrice),
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

  #prepareCartLine(line) {
    const uuid = line.product.sourceUuid ?? null;
    const preview = uuid ? this.#previews.get(uuid) ?? null : null;
    return {
      ...line,
      unitPriceLabel: this.#formatCopper(line.quotedUnitPrice),
      totalPriceLabel: this.#formatCopper(line.quotedTotalPrice),
      expanded: uuid ? this.#expandedItems.has(uuid) : false,
      previewUuid: uuid,
      preview: preview ? {
        ...preview,
        traitLabels: preview.traits.map((trait) => this.#traitLabel(trait))
      } : null,
      previewError: uuid ? this.#previewErrors.get(uuid) ?? null : null
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

  #transactionErrorLabel(error) {
    const key = `PF2E_MARKET_FORGE.TransactionError.${error}`;
    const localized = game.i18n.localize(key);
    return localized === key ? String(error) : localized;
  }

  #transactionWarningLabel(warning) {
    const key = `PF2E_MARKET_FORGE.TransactionWarning.${warning}`;
    const localized = game.i18n.localize(key);
    return localized === key ? String(warning) : localized;
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
    const root = this.element.querySelector(".market-forge-content");
    if (!root) return;

    try {
      globalThis.game?.pf2e?.system?.bindDragDropListeners?.(root);
    } catch (_error) {
      // Enriched inline links remain usable even when no optional PF2e binder is exposed.
    }
  }

  #resolveLevelContext() {
    return resolveMarketMaximumForActor(this.#profile, this.#actor, {
      activeParty: globalThis.game?.actors?.party ?? null
    });
  }

  async #safeBalance(actorUuid) {
    try {
      return await this.#currencyAdapter.getBalance(actorUuid);
    } catch (error) {
      console.warn(`${MODULE_ID} | Could not read actor currency`, actorUuid, error);
      return 0;
    }
  }

  #physicalItemCount(actor) {
    const contents = actor?.inventory?.contents;
    if (!contents) return 0;
    return Array.from(contents).length;
  }

  #formatCopper(value) {
    let remainder = Math.max(0, Math.trunc(Number(value) || 0));
    const gp = Math.floor(remainder / 100);
    remainder %= 100;
    const sp = Math.floor(remainder / 10);
    const cp = remainder % 10;
    const parts = [[gp, "gp"], [sp, "sp"], [cp, "cp"]]
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
