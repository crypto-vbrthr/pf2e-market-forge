import { CartService } from "../cart/cart-service.js";
import { CatalogService } from "../catalog/catalog-service.js";
import { ItemPreviewService } from "../catalog/preview-service.js";
import { SpellCatalogService } from "../catalog/spell-catalog-service.js";
import { SpellPreviewService } from "../catalog/spell-preview-service.js";
import { MODULE_ID } from "../core/constants.js";
import { createRuntimeId } from "../core/id.js";
import { SaleInventoryService } from "../inventory/sale-inventory-service.js";
import { evaluateAvailability } from "../market/availability-service.js";
import { resolveMarketMaximumForActor } from "../market/market-level-context.js";
import { createDefaultMarketProfile } from "../market/profile-defaults.js";
import { WorldMarketProfileService } from "../market/world-profile-service.js";
import { MarketProductResolver } from "../market/product-resolver.js";
import { CurrencyAdapter } from "../pf2e/currency-adapter.js";
import { InventoryAdapter } from "../pf2e/inventory-adapter.js";
import { hasAnySpellItemBaseConfig, hasSpellItemBaseConfig } from "../pf2e/capabilities.js";
import { SpellItemAdapter } from "../pf2e/spell-item-adapter.js";
import { ReceiptService } from "../receipts/receipt-service.js";
import { PriceService } from "../pricing/price-service.js";
import { SpellItemService } from "../spells/spell-item-service.js";
import { TransactionService } from "../transactions/transaction-service.js";
import { getMarketSocket } from "../socket/market-socket.js";
import { createCatalogViewState, toggleExpandedUuid, updateCatalogViewState } from "./catalog-view-state.js";
import { buildTabState, initialTabFromMode, normalizeMarketTab } from "./market-window-state.js";
import { createSpellViewState, updateSpellViewState } from "./spell-view-state.js";
import { readMarketListLimit } from "../settings/list-limit.js";

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
      template: `modules/${MODULE_ID}/templates/market.hbs`,
      scrollable: [".market-forge-content"]
    }
  };

  #actor;
  #launchOptions;
  #activeTab;
  #profile;
  #profileService;
  #catalogService;
  #previewService;
  #spellCatalogService;
  #spellPreviewService;
  #spellItemService;
  #spellItemAdapter;
  #cartService;
  #priceService;
  #currencyAdapter;
  #inventoryAdapter;
  #saleInventoryService;
  #receiptService;
  #transactionService;
  #productResolver;
  #checkoutTransport;
  #catalogFilters = createCatalogViewState();
  #spellView = createSpellViewState();
  #expandedItems = new Set();
  #previews = new Map();
  #previewErrors = new Map();
  #expandedSpells = new Set();
  #spellPreviews = new Map();
  #spellPreviewErrors = new Map();
  #checkoutState = null;
  #checkoutBusy = false;
  #checkoutOperationId = null;
  #searchTimer = null;
  #profilesChangedHookId = null;

  constructor({
    actor,
    launchOptions = {},
    profile = null,
    profileService = null,
    catalogService = null,
    previewService = null,
    spellCatalogService = null,
    spellPreviewService = null,
    spellItemService = null,
    spellItemAdapter = null,
    cartService = null,
    priceService = null,
    currencyAdapter = null,
    inventoryAdapter = null,
    saleInventoryService = null,
    receiptService = null,
    transactionService = null,
    productResolver = null,
    checkoutTransport = null
  } = {}) {
    super();
    this.#actor = actor ?? null;
    this.#launchOptions = structuredClone(launchOptions);
    this.#activeTab = initialTabFromMode(launchOptions.initialMode);
    this.#profile = profile ?? createDefaultMarketProfile();
    this.#profileService = profileService ?? new WorldMarketProfileService();
    this.#catalogService = catalogService ?? new CatalogService();
    this.#previewService = previewService ?? new ItemPreviewService();
    this.#spellCatalogService = spellCatalogService ?? new SpellCatalogService();
    this.#spellPreviewService = spellPreviewService ?? new SpellPreviewService();
    this.#spellItemService = spellItemService ?? new SpellItemService();
    this.#spellItemAdapter = spellItemAdapter ?? new SpellItemAdapter();
    this.#cartService = cartService ?? new CartService();
    this.#priceService = priceService ?? new PriceService();
    const actorProvider = async (uuid) => {
      if (this.#actor?.uuid === uuid) return this.#actor;
      return typeof globalThis.fromUuid === "function" ? globalThis.fromUuid(uuid) : null;
    };
    this.#currencyAdapter = currencyAdapter ?? new CurrencyAdapter({ actorProvider });
    this.#inventoryAdapter = inventoryAdapter ?? new InventoryAdapter({ actorProvider });
    this.#saleInventoryService = saleInventoryService ?? new SaleInventoryService({ inventoryAdapter: this.#inventoryAdapter });
    if (this.#activeTab === "sell") this.#cartService.setActiveDirection("sell");
    this.#receiptService = receiptService ?? new ReceiptService({ actorProvider });
    this.#checkoutTransport = checkoutTransport ?? { checkout: (request) => getMarketSocket().requestCheckout(request) };
    this.#productResolver = productResolver ?? new MarketProductResolver({
      catalogService: this.#catalogService,
      spellCatalogService: this.#spellCatalogService,
      spellItemService: this.#spellItemService,
      spellItemAdapter: this.#spellItemAdapter,
      saleInventoryService: this.#saleInventoryService,
      inventoryAdapter: this.#inventoryAdapter
    });
    this.#transactionService = transactionService ?? new TransactionService({
      profileProvider: async (profileId) => profileId === this.#profile.id ? this.#profile : null,
      productResolver: (product, context) => this.#productResolver.resolve(product, context),
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

    this.#registerProfileChangeHook();
  }

  get actor() {
    return this.#actor;
  }

  _onClose(options) {
    if (this.#profilesChangedHookId !== null) {
      globalThis.Hooks?.off?.(`${MODULE_ID}.profilesChanged`, this.#profilesChangedHookId);
      this.#profilesChangedHookId = null;
    }
    return super._onClose?.(options);
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const persistedProfile = this.#profileService.getProfile(this.#profile?.id);
    if (persistedProfile) this.#profile = persistedProfile;
    const actor = this.#actor;
    const tabs = buildTabState(this.#activeTab);
    const levelContext = this.#resolveLevelContext();
    const maximumItemLevel = levelContext.result?.maximumItemLevel ?? null;
    const balance = actor ? await this.#safeBalance(actor.uuid) : 0;
    const listLimit = readMarketListLimit();

    let catalog = emptyCatalogResult();
    if (tabs.buy.active) {
      catalog = await this.#catalogService.search({
        profile: this.#profile,
        maximumItemLevel,
        filters: this.#catalogFilters,
        limit: listLimit
      });
    }

    const preparedEntries = catalog.entries.map((entry) => this.#prepareCatalogEntry(entry));

    let spellCatalog = emptySpellCatalogResult();
    let spellBuilder = null;
    if (tabs["spell-items"].active) {
      spellCatalog = await this.#spellCatalogService.search({
        profile: this.#profile,
        filters: this.#spellView,
        limit: listLimit
      });
      spellBuilder = await this.#prepareSpellBuilder(spellCatalog, maximumItemLevel);
    }

    const cartState = this.#cartService.getState();
    const activeDirection = cartState.activeDirection;
    let saleInventoryEntries = [];
    if (actor && (tabs.sell.active || (tabs.cart.active && activeDirection === "sell"))) {
      saleInventoryEntries = await this.#saleInventoryService.list(actor.uuid);
    }
    const preparedSaleEntries = saleInventoryEntries.map((entry) => this.#prepareSaleEntry(entry));

    const activeCartLines = activeDirection === "sell" ? cartState.sellLines : cartState.buyLines;
    const preparedCartLines = activeCartLines.map((line) => this.#prepareCartLine(line));
    const buyCount = cartState.buyLines.reduce((sum, line) => sum + line.quantity, 0);
    const sellCount = cartState.sellLines.reduce((sum, line) => sum + line.quantity, 0);
    const cartCount = buyCount + sellCount;
    const quotedTotal = this.#cartService.getQuotedTotal(activeDirection);
    const affordable = activeDirection === "sell" || balance >= quotedTotal;
    const remaining = activeDirection === "sell" ? balance + quotedTotal : Math.max(0, balance - quotedTotal);
    const deficit = activeDirection === "buy" && !affordable ? quotedTotal - balance : 0;
    const profiles = this.#profileService.getProfiles();
    const defaultProfileId = this.#profileService.getDefaultProfileId();

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
        name: this.#profile.name,
        isDefault: this.#profile.id === defaultProfileId,
        levelMode: game.i18n.localize(`PF2E_MARKET_FORGE.LevelMode.${this.#profile.availability.levelLimit.mode}`),
        offset: this.#profile.availability.levelLimit.offset,
        maximumItemLevel,
        maximumItemLevelLabel: maximumItemLevel === null
          ? game.i18n.localize("PF2E_MARKET_FORGE.Unlimited")
          : String(maximumItemLevel)
      },
      profileOptions: profiles.map((profile) => ({
        id: profile.id,
        name: profile.name,
        selected: profile.id === this.#profile.id,
        isDefault: profile.id === defaultProfileId
      })),
      canManageProfiles: Boolean(game.user?.isGM),
      tabs,
      buyTab: tabs.buy,
      spellItemsTab: tabs["spell-items"],
      sellTab: tabs.sell,
      cartTab: tabs.cart,
      inventoryCount: this.#physicalItemCount(actor),
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
      spellCatalog: {
        ...spellCatalog,
        entries: spellCatalog.entries.map((entry) => this.#prepareSpellEntry(entry)),
        hasEntries: spellCatalog.entries.length > 0,
        resultLabel: this.#spellResultLabel(spellCatalog.entries.length, spellCatalog.total, spellCatalog.truncated),
        sourceWarnings: spellCatalog.sources.filter((source) => source.status !== "ready")
      },
      spellFilters: this.#spellView,
      spellOptions: this.#spellOptions(spellCatalog.facets),
      spellBuilder,
      saleInventory: {
        entries: preparedSaleEntries,
        hasEntries: preparedSaleEntries.length > 0,
        count: preparedSaleEntries.length,
        sellableCount: preparedSaleEntries.filter((entry) => entry.available).length
      },
      cart: {
        direction: activeDirection,
        isBuy: activeDirection === "buy",
        isSell: activeDirection === "sell",
        lines: preparedCartLines,
        hasLines: preparedCartLines.length > 0,
        count: cartCount,
        buyCount,
        sellCount,
        lineCount: preparedCartLines.length,
        quotedTotal,
        quotedTotalLabel: this.#formatCopper(quotedTotal),
        balance,
        balanceLabel: this.#formatCopper(balance),
        affordable,
        remainingLabel: this.#formatCopper(remaining),
        deficitLabel: this.#formatCopper(deficit),
        itemActorName: actor?.name ?? game.i18n.localize("PF2E_MARKET_FORGE.NotAvailable"),
        currencyActorName: actor?.name ?? game.i18n.localize("PF2E_MARKET_FORGE.NotAvailable"),
        canDryRun: Boolean(actor && preparedCartLines.length && !this.#checkoutBusy),
        canCheckout: Boolean(actor && preparedCartLines.length && affordable && !this.#checkoutBusy)
      },
      checkout: this.#prepareCheckoutState(),
      marketLevelContext: {
        partyName: levelContext.party?.name ?? null,
        memberLevels: levelContext.memberLevels.join(", "),
        calculationLabel: this.#levelCalculationLabel(levelContext)
      }
    });
  }

  async _onRender(context, options) {
    await super._onRender(context, options);

    this.element.querySelector("[data-market-profile]")?.addEventListener("change", async (event) => {
      await this.#switchProfile(event.currentTarget.value);
    });

    this.element.querySelector("[data-market-manage-profiles]")?.addEventListener("click", async () => {
      const { MarketProfilesApplication } = await import("./market-profiles-application.js");
      const app = new MarketProfilesApplication({ profileService: this.#profileService });
      await app.render({ force: true });
    });

    for (const button of this.element.querySelectorAll("[data-market-tab]")) {
      button.addEventListener("click", () => {
        this.#activeTab = normalizeMarketTab(button.dataset.marketTab, this.#activeTab);
        if (["buy", "spell-items"].includes(this.#activeTab)) this.#cartService.setActiveDirection("buy");
        if (this.#activeTab === "sell") this.#cartService.setActiveDirection("sell");
        this.#checkoutState = null;
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

    const spellSearch = this.element.querySelector("[data-spell-filter='search']");
    spellSearch?.addEventListener("input", (event) => {
      clearTimeout(this.#searchTimer);
      const value = event.currentTarget.value;
      this.#searchTimer = setTimeout(() => {
        this.#spellView = updateSpellViewState(this.#spellView, "search", value);
        this.render();
      }, 220);
    });

    for (const select of this.element.querySelectorAll("select[data-spell-filter]")) {
      select.addEventListener("change", (event) => {
        const field = event.currentTarget.dataset.spellFilter;
        this.#spellView = updateSpellViewState(this.#spellView, field, event.currentTarget.value);
        this.render();
      });
    }

    for (const button of this.element.querySelectorAll("[data-spell-select]")) {
      button.addEventListener("click", () => {
        this.#spellView = updateSpellViewState(this.#spellView, "selectedSpellUuid", button.dataset.spellSelect);
        this.#spellView = updateSpellViewState(this.#spellView, "castRank", null);
        this.render();
      });
    }

    this.element.querySelector("[data-spell-kind]")?.addEventListener("change", (event) => {
      this.#spellView = updateSpellViewState(this.#spellView, "kind", event.currentTarget.value);
      this.#spellView = updateSpellViewState(this.#spellView, "castRank", null);
      this.render();
    });

    this.element.querySelector("[data-spell-rank]")?.addEventListener("change", (event) => {
      this.#spellView = updateSpellViewState(this.#spellView, "castRank", event.currentTarget.value);
      this.render();
    });

    this.element.querySelector("[data-spell-quantity]")?.addEventListener("change", (event) => {
      const quantity = Math.max(1, Math.min(999, Math.trunc(Number(event.currentTarget.value) || 1)));
      this.#spellView = updateSpellViewState(this.#spellView, "quantity", quantity);
      this.render();
    });

    this.element.querySelector("[data-spell-add-cart]")?.addEventListener("click", async () => this.#runCartAction(() => this.#addSpellItem()));
    this.element.querySelector("[data-spell-open]")?.addEventListener("click", async (event) => {
      try {
        await this.#spellPreviewService.openSheet(event.currentTarget.dataset.spellOpen);
      } catch (error) {
        console.error(`${MODULE_ID} | Could not open spell sheet`, error);
        ui.notifications?.error?.(game.i18n.localize("PF2E_MARKET_FORGE.Spells.OpenFailed"));
      }
    });

    for (const button of this.element.querySelectorAll("[data-market-expand-spell]")) {
      button.addEventListener("click", async () => {
        await this.#toggleSpellPreview(button.dataset.marketExpandSpell, Number(button.dataset.spellRank));
      });
    }

    for (const button of this.element.querySelectorAll("[data-market-open-spell]")) {
      button.addEventListener("click", async () => this.#spellPreviewService.openSheet(button.dataset.marketOpenSpell));
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
      button.addEventListener("click", async () => this.#runCartAction(() => this.#addCatalogItem(button.dataset.marketAddItem)));
    }

    for (const button of this.element.querySelectorAll("[data-market-add-sale]")) {
      button.addEventListener("click", async () => this.#runCartAction(() => this.#addSaleItem(button.dataset.marketAddSale)));
    }

    for (const button of this.element.querySelectorAll("[data-cart-direction]")) {
      button.addEventListener("click", () => {
        this.#cartService.setActiveDirection(button.dataset.cartDirection);
        this.#checkoutState = null;
        this.render();
      });
    }

    for (const button of this.element.querySelectorAll("[data-cart-adjust-line]")) {
      button.addEventListener("click", () => {
        const lineId = button.dataset.cartAdjustLine;
        const direction = button.dataset.cartDirection ?? this.#cartService.getState().activeDirection;
        const delta = Number(button.dataset.delta ?? 0);
        const state = this.#cartService.getState();
        const lines = direction === "sell" ? state.sellLines : state.buyLines;
        const line = lines.find((entry) => entry.id === lineId);
        if (!line || !Number.isSafeInteger(delta)) return;
        const maximum = direction === "sell" ? Math.max(1, Number(line.product.availableQuantity ?? 999)) : 999;
        this.#cartService.setQuantity(direction, lineId, Math.max(1, Math.min(maximum, line.quantity + delta)));
        this.#cartChanged();
        this.render();
      });
    }

    for (const input of this.element.querySelectorAll("[data-cart-quantity-line]")) {
      input.addEventListener("change", () => {
        const lineId = input.dataset.cartQuantityLine;
        const direction = input.dataset.cartDirection ?? this.#cartService.getState().activeDirection;
        const maximum = Math.max(1, Math.trunc(Number(input.max) || 999));
        const quantity = Math.max(1, Math.min(maximum, Math.trunc(Number(input.value) || 1)));
        this.#cartService.setQuantity(direction, lineId, quantity);
        this.#cartChanged();
        this.render();
      });
    }

    for (const button of this.element.querySelectorAll("[data-cart-remove-line]")) {
      button.addEventListener("click", () => {
        const direction = button.dataset.cartDirection ?? this.#cartService.getState().activeDirection;
        this.#cartService.remove(direction, button.dataset.cartRemoveLine);
        this.#cartChanged();
        this.render();
      });
    }

    this.element.querySelector("[data-cart-clear]")?.addEventListener("click", () => {
      const direction = this.#cartService.getState().activeDirection;
      this.#cartService.clear(direction);
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

  async #runCartAction(action) {
    try {
      await action();
    } catch (error) {
      console.error(`${MODULE_ID} | Could not update market cart`, error);
      ui.notifications?.error?.(game.i18n.localize("PF2E_MARKET_FORGE.Errors.CartActionFailed"));
    }
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
    this.#cartService.setActiveDirection("buy");
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

  async #addSpellItem() {
    const spellUuid = this.#spellView.selectedSpellUuid;
    if (!spellUuid) return;
    const maximumItemLevel = this.#resolveLevelContext().result?.maximumItemLevel ?? null;
    const spellEntry = await this.#spellCatalogService.getEntry(spellUuid, { profile: this.#profile });
    if (!spellEntry) return;
    const kind = this.#normalizedSpellKind(spellEntry);
    const castRank = this.#normalizedSpellRank(spellEntry, kind);
    const draft = this.#createSpellDraft(spellEntry, kind, castRank, maximumItemLevel);
    if (!draft.availability.available) {
      ui.notifications?.warn?.(game.i18n.localize("PF2E_MARKET_FORGE.Spells.Unavailable"));
      return;
    }
    const quantity = Math.max(1, Math.min(999, Math.trunc(Number(this.#spellView.quantity) || 1)));
    const quote = this.#priceService.quotePurchase(draft, quantity, this.#profile);
    const name = this.#spellProductName(kind, spellEntry.name, castRank);
    this.#cartService.setActiveDirection("buy");
    this.#cartService.add({
      direction: "buy",
      quantity,
      quote,
      product: {
        kind,
        spellUuid: spellEntry.uuid,
        spellRank: castRank,
        name,
        img: spellEntry.img,
        level: draft.itemLevel
      }
    });
    this.#cartChanged();
    ui.notifications?.info?.(game.i18n.format("PF2E_MARKET_FORGE.Cart.Added", { quantity, name }));
    await this.render();
  }

  async #addSaleItem(uuid) {
    if (!uuid || !this.#actor) return;
    const quantityInput = Array.from(this.element.querySelectorAll("[data-market-sale-quantity]")).find(
      (input) => input.dataset.marketSaleQuantity === uuid
    );
    const entry = await this.#saleInventoryService.getEntry(this.#actor.uuid, uuid);
    if (!entry?.availability?.available) {
      ui.notifications?.warn?.(game.i18n.localize("PF2E_MARKET_FORGE.Sell.ItemUnavailable"));
      return;
    }

    const quantity = Math.max(1, Math.min(entry.quantity, Math.trunc(Number(quantityInput?.value) || 1)));
    const quote = this.#priceService.quoteSale(entry, quantity, this.#profile);
    this.#cartService.setActiveDirection("sell");
    this.#cartService.add({
      direction: "sell",
      quantity,
      quote,
      product: {
        kind: "item",
        inventoryItemUuid: entry.uuid,
        name: entry.name,
        img: entry.img,
        level: entry.level,
        availableQuantity: entry.quantity
      }
    });
    this.#cartChanged();
    ui.notifications?.info?.(game.i18n.format("PF2E_MARKET_FORGE.Sell.Added", { quantity, name: entry.name }));
    await this.render();
  }

  async #runCheckoutDryRun() {
    const actor = this.#actor;
    const state = this.#cartService.getState();
    const direction = state.activeDirection;
    const lines = direction === "sell" ? state.sellLines : state.buyLines;
    if (!actor || lines.length === 0) return;

    const request = this.#buildCheckoutRequest(lines, direction);

    try {
      const maximumItemLevel = this.#resolveLevelContext().result?.maximumItemLevel ?? null;
      const { plan, validation } = await this.#transactionService.dryRun(request, {
        maximumItemLevel,
        requestedByUserId: globalThis.game?.user?.id ?? "unknown-user"
      });
      this.#checkoutState = {
        direction,
        status: validation.valid ? "valid" : "invalid",
        total: plan.total,
        balance: validation.availableBalance ?? await this.#safeBalance(actor.uuid),
        remaining: validation.remainingBalance ?? null,
        errors: validation.errors,
        warnings: validation.warnings ?? []
      };
    } catch (error) {
      console.error(`${MODULE_ID} | Checkout dry run failed`, error);
      this.#checkoutState = {
        direction,
        status: "error",
        total: 0,
        balance: await this.#safeBalance(actor.uuid),
        remaining: null,
        errors: [error instanceof Error ? error.message : String(error)],
        warnings: []
      };
    }

    await this.render();
  }

  async #runCheckout() {
    if (this.#checkoutBusy) return;
    const actor = this.#actor;
    const state = this.#cartService.getState();
    const direction = state.activeDirection;
    const lines = direction === "sell" ? state.sellLines : state.buyLines;
    if (!actor || lines.length === 0) return;

    this.#checkoutBusy = true;
    this.#checkoutOperationId ??= createRuntimeId();
    const request = this.#buildCheckoutRequest(lines, direction, { operationId: this.#checkoutOperationId });
    this.#checkoutState = {
      direction,
      status: "running",
      total: this.#cartService.getQuotedTotal(direction),
      balance: await this.#safeBalance(actor.uuid),
      remaining: null,
      errors: [],
      warnings: []
    };
    await this.render();

    try {
      const result = await this.#checkoutTransport.checkout(request);
      const balance = await this.#safeBalance(actor.uuid);
      const timedOut = Array.isArray(result.errors) && result.errors.includes("authority-timeout");
      if (!timedOut) this.#checkoutOperationId = null;

      if (result.status === "completed") {
        this.#cartService.clear(direction);
        this.#checkoutState = {
          direction,
          status: "completed",
          total: result.total,
          balance,
          remaining: result.remainingBalance ?? balance,
          errors: [],
          warnings: result.warnings ?? [],
          transactionId: result.transactionId
        };
        const key = direction === "sell" ? "PF2E_MARKET_FORGE.Sell.Success" : "PF2E_MARKET_FORGE.Cart.PurchaseSuccess";
        ui.notifications?.info?.(game.i18n.format(key, { total: this.#formatCopper(result.total) }));
      } else {
        this.#checkoutState = {
          direction,
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
          : direction === "sell"
            ? "PF2E_MARKET_FORGE.Sell.FailedNotification"
            : "PF2E_MARKET_FORGE.Cart.PurchaseFailedNotification";
        ui.notifications?.error?.(game.i18n.localize(key));
      }
    } catch (error) {
      console.error(`${MODULE_ID} | ${direction === "sell" ? "Sale" : "Purchase"} checkout failed`, error);
      this.#checkoutState = {
        direction,
        status: "error",
        total: 0,
        balance: await this.#safeBalance(actor.uuid),
        remaining: null,
        errors: ["transaction-error"],
        warnings: [],
        cause: error instanceof Error ? error.message : String(error)
      };
      const key = direction === "sell"
        ? "PF2E_MARKET_FORGE.Sell.FailedNotification"
        : "PF2E_MARKET_FORGE.Cart.PurchaseFailedNotification";
      ui.notifications?.error?.(game.i18n.localize(key));
    } finally {
      this.#checkoutBusy = false;
    }

    await this.render();
  }

  #buildCheckoutRequest(lines, direction = this.#cartService.getState().activeDirection, { operationId = null } = {}) {
    const actor = this.#actor;
    return {
      direction,
      profileId: this.#profile.id,
      itemActorUuid: actor.uuid,
      currencyActorUuid: actor.uuid,
      ...(operationId ? { operationId } : {}),
      lines: lines.map((line) => ({
        product: structuredClone(line.product),
        quantity: line.quantity
      }))
    };
  }

  #cartChanged() {
    this.#checkoutState = null;
    this.#checkoutOperationId = null;
  }

  #prepareCheckoutState() {
    const state = this.#checkoutState;
    if (!state) return null;
    const errorLabels = state.errors.map((error) => this.#transactionErrorLabel(error));
    const remaining = Number.isSafeInteger(state.remaining) ? state.remaining : null;
    return {
      ...state,
      isBuy: state.direction !== "sell",
      isSell: state.direction === "sell",
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

  #prepareSaleEntry(entry) {
    const preview = this.#previews.get(entry.uuid) ?? null;
    const expanded = this.#expandedItems.has(entry.uuid);
    const quote = this.#priceService.quoteSale(entry, 1, this.#profile);
    const availabilityReasons = (entry.availability?.reasons ?? []).map((reason) => this.#saleReasonLabel(reason));

    return {
      ...entry,
      priceLabel: this.#formatCopper(quote.unitPrice),
      basePriceLabel: this.#formatCopper(entry.baseUnitPrice),
      ruleLabel: game.i18n.localize(`PF2E_MARKET_FORGE.PriceRule.${quote.rule}`),
      rarityLabel: game.i18n.localize(`PF2E_MARKET_FORGE.Rarity.${entry.rarity}`),
      typeLabel: this.#itemTypeLabel(entry.itemType),
      expanded,
      preview: preview ? {
        ...preview,
        traitLabels: preview.traits.map((trait) => this.#traitLabel(trait))
      } : null,
      previewError: this.#previewErrors.get(entry.uuid) ?? null,
      available: entry.availability?.available === true,
      availabilityReasons,
      availabilityReasonText: availabilityReasons.join(" · ")
    };
  }

  #prepareCartLine(line) {
    const isSpell = ["scroll", "wand"].includes(line.product.kind);
    const uuid = isSpell ? line.product.spellUuid : (line.product.sourceUuid ?? line.product.inventoryItemUuid ?? null);
    const spellKey = isSpell ? this.#spellPreviewKey(uuid, line.product.spellRank) : null;
    const preview = isSpell
      ? this.#spellPreviews.get(spellKey) ?? null
      : uuid ? this.#previews.get(uuid) ?? null : null;
    const maximum = line.direction === "sell" ? Math.max(1, Number(line.product.availableQuantity ?? line.quantity)) : 999;
    return {
      ...line,
      isSpell,
      unitPriceLabel: this.#formatCopper(line.quotedUnitPrice),
      totalPriceLabel: this.#formatCopper(line.quotedTotalPrice),
      maxQuantity: maximum,
      expanded: isSpell ? this.#expandedSpells.has(spellKey) : (uuid ? this.#expandedItems.has(uuid) : false),
      previewUuid: uuid,
      preview: preview ? {
        ...preview,
        traitLabels: preview.traits.map((trait) => this.#traitLabel(trait)),
        traditionLabels: (preview.traditions ?? []).map((tradition) => this.#traditionLabel(tradition))
      } : null,
      previewError: isSpell
        ? this.#spellPreviewErrors.get(spellKey) ?? null
        : uuid ? this.#previewErrors.get(uuid) ?? null : null
    };
  }

  #prepareSpellEntry(entry) {
    return {
      ...entry,
      selected: this.#spellView.selectedSpellUuid === entry.uuid,
      rarityLabel: game.i18n.localize(`PF2E_MARKET_FORGE.Rarity.${entry.rarity}`),
      traditionLabels: entry.traditions.map((tradition) => this.#traditionLabel(tradition)),
      traditionsText: entry.traditions.map((tradition) => this.#traditionLabel(tradition)).join(", ")
    };
  }

  async #prepareSpellBuilder(spellCatalog, maximumItemLevel) {
    let selected = null;
    const selectedUuid = this.#spellView.selectedSpellUuid;
    if (selectedUuid) selected = spellCatalog.entries.find((entry) => entry.uuid === selectedUuid) ?? await this.#spellCatalogService.getEntry(selectedUuid, { profile: this.#profile });
    if (!selected && spellCatalog.entries.length) {
      selected = spellCatalog.entries[0];
      this.#spellView = updateSpellViewState(this.#spellView, "selectedSpellUuid", selected.uuid);
      this.#spellView = updateSpellViewState(this.#spellView, "castRank", null);
    }
    if (!selected) return null;

    const kind = this.#normalizedSpellKind(selected);
    const castRank = this.#normalizedSpellRank(selected, kind);
    const draft = this.#createSpellDraft(selected, kind, castRank, maximumItemLevel);
    let preview = null;
    let previewError = null;
    try {
      preview = await this.#spellPreviewService.getPreview(selected.uuid, castRank);
    } catch (error) {
      previewError = error instanceof Error ? error.message : String(error);
    }
    const quantity = Math.max(1, Math.min(999, Math.trunc(Number(this.#spellView.quantity) || 1)));
    const quote = this.#priceService.quotePurchase(draft, quantity, this.#profile);
    const rankOptions = this.#spellRankOptions(selected, kind, maximumItemLevel);
    const kindOptions = [
      {
        value: "scroll",
        label: game.i18n.localize("PF2E_MARKET_FORGE.Spells.Scroll"),
        disabled: this.#profile.spellItems?.scrolls !== true || !hasAnySpellItemBaseConfig("scroll", { minimumRank: selected.baseRank }),
        selected: kind === "scroll"
      },
      {
        value: "wand",
        label: game.i18n.localize("PF2E_MARKET_FORGE.Spells.Wand"),
        disabled: this.#profile.spellItems?.wands !== true || selected.baseRank > 9 || !hasAnySpellItemBaseConfig("wand", { minimumRank: selected.baseRank }),
        selected: kind === "wand"
      }
    ];
    return {
      spell: this.#prepareSpellEntry(selected),
      kind,
      kindOptions,
      castRank,
      rankOptions,
      quantity,
      itemLevel: draft.itemLevel,
      priceLabel: this.#formatCopper(quote.unitPrice),
      totalPriceLabel: this.#formatCopper(quote.totalPrice),
      available: draft.availability.available,
      availabilityReasonText: draft.availability.reasons.map((reason) => this.#availabilityReasonLabel(reason, draft.availability.marketMaximumLevel)).join(" · "),
      productName: this.#spellProductName(kind, selected.name, castRank),
      preview: preview ? {
        ...preview,
        traitLabels: preview.traits.map((trait) => this.#traitLabel(trait)),
        traditionLabels: preview.traditions.map((tradition) => this.#traditionLabel(tradition))
      } : null,
      previewError
    };
  }

  #createSpellDraft(entry, kind, castRank, maximumItemLevel) {
    const draft = this.#spellItemService.createDraft({
      kind,
      spellUuid: entry.uuid,
      spellName: entry.name,
      baseRank: entry.baseRank,
      castRank,
      rarity: entry.rarity,
      spellCost: entry.cost ?? ""
    });
    const availability = evaluateAvailability(
      { level: draft.itemLevel, rarity: entry.rarity, sourcePack: entry.sourcePack },
      this.#profile,
      { maximumItemLevel, sourceKind: "spell" }
    );
    availability.reasons = [...new Set([...(availability.reasons ?? []), ...(draft.availability?.reasons ?? [])])];
    availability.available = availability.reasons.length === 0;
    const enabled = kind === "scroll" ? this.#profile.spellItems?.scrolls === true : this.#profile.spellItems?.wands === true;
    if (!enabled) {
      availability.available = false;
      availability.reasons = [...new Set([...(availability.reasons ?? []), "spell-item-type-disabled"])];
    }
    if (!hasSpellItemBaseConfig(kind, castRank)) {
      availability.available = false;
      availability.reasons = [...new Set([...(availability.reasons ?? []), "pf2e-incompatible"])];
    }
    draft.availability = availability;
    return draft;
  }

  #normalizedSpellKind(entry = null) {
    const minimumRank = entry?.baseRank ?? 1;
    const scrollAllowed = this.#profile.spellItems?.scrolls === true
      && hasAnySpellItemBaseConfig("scroll", { minimumRank });
    const wandAllowed = this.#profile.spellItems?.wands === true
      && minimumRank <= 9
      && hasAnySpellItemBaseConfig("wand", { minimumRank });
    const requested = this.#spellView.kind;
    if (requested === "wand" && wandAllowed) return "wand";
    if (requested === "scroll" && scrollAllowed) return "scroll";
    if (scrollAllowed) return "scroll";
    if (wandAllowed) return "wand";
    return requested === "wand" ? "wand" : "scroll";
  }

  #normalizedSpellRank(entry, kind) {
    const maximum = kind === "scroll" ? 10 : 9;
    const requested = Number(this.#spellView.castRank);
    if (Number.isSafeInteger(requested) && requested >= entry.baseRank && requested <= maximum) return requested;
    return Math.min(maximum, entry.baseRank);
  }

  #spellRankOptions(entry, kind, maximumItemLevel) {
    const maximum = kind === "scroll" ? 10 : 9;
    const selected = this.#normalizedSpellRank(entry, kind);
    const options = [];
    for (let rank = entry.baseRank; rank <= maximum; rank += 1) {
      const draft = this.#createSpellDraft(entry, kind, rank, maximumItemLevel);
      options.push({
        value: rank,
        label: game.i18n.format("PF2E_MARKET_FORGE.Spells.RankOption", { rank, level: draft.itemLevel, price: this.#formatCopper(draft.baseUnitPrice) }),
        selected: rank === selected,
        disabled: !draft.availability.available
      });
    }
    return options;
  }

  #spellOptions(facets) {
    return {
      ranks: facets.ranks.map((rank) => ({ value: String(rank), label: String(rank), selected: String(this.#spellView.baseRank) === String(rank) })),
      traditions: facets.traditions.map((tradition) => ({ value: tradition, label: this.#traditionLabel(tradition), selected: this.#spellView.tradition === tradition })),
      rarities: ["common", "uncommon", "rare", "unique"].filter((rarity) => facets.rarities.includes(rarity)).map((rarity) => ({ value: rarity, label: game.i18n.localize(`PF2E_MARKET_FORGE.Rarity.${rarity}`), selected: this.#spellView.rarity === rarity })),
      sources: facets.sources.map((source) => ({ ...source, selected: this.#spellView.sourcePack === source.id }))
    };
  }

  #spellResultLabel(visible, total, truncated) {
    return truncated
      ? game.i18n.format("PF2E_MARKET_FORGE.Spells.ResultsTruncated", { visible, total })
      : game.i18n.format("PF2E_MARKET_FORGE.Spells.Results", { count: total });
  }

  #spellProductName(kind, spellName, rank) {
    const key = kind === "scroll" ? "PF2E_MARKET_FORGE.Spells.ScrollProduct" : "PF2E_MARKET_FORGE.Spells.WandProduct";
    return game.i18n.format(key, { name: spellName, rank });
  }

  async #toggleSpellPreview(uuid, rank) {
    if (!uuid || !Number.isSafeInteger(rank)) return;
    const key = this.#spellPreviewKey(uuid, rank);
    if (this.#expandedSpells.has(key)) this.#expandedSpells.delete(key);
    else this.#expandedSpells.add(key);
    this.#spellPreviewErrors.delete(key);
    if (this.#expandedSpells.has(key) && !this.#spellPreviews.has(key)) {
      try {
        this.#spellPreviews.set(key, await this.#spellPreviewService.getPreview(uuid, rank));
      } catch (error) {
        this.#spellPreviewErrors.set(key, error instanceof Error ? error.message : String(error));
      }
    }
    await this.render();
  }

  #spellPreviewKey(uuid, rank) {
    return `${uuid}#${rank}`;
  }

  #traditionLabel(tradition) {
    const key = globalThis.CONFIG?.PF2E?.magicTraditions?.[tradition];
    if (key) {
      const localized = game.i18n.localize(key);
      if (localized !== key) return localized;
    }
    const own = `PF2E_MARKET_FORGE.Tradition.${tradition}`;
    const localized = game.i18n.localize(own);
    return localized === own ? tradition : localized;
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
    const key = `PF2E_MARKET_FORGE.Availability.${reason}`;
    const localized = game.i18n.localize(key);
    return localized === key ? String(reason) : localized;
  }

  #saleReasonLabel(reason) {
    const key = `PF2E_MARKET_FORGE.SellReason.${reason}`;
    const localized = game.i18n.localize(key);
    return localized === key ? String(reason) : localized;
  }

  #transactionErrorLabel(error) {
    const key = `PF2E_MARKET_FORGE.TransactionError.${error}`;
    const localized = game.i18n.localize(key);
    return localized === key ? String(error) : localized;
  }

  #registerProfileChangeHook() {
    const hooks = globalThis.Hooks;
    if (typeof hooks?.on !== "function") return;
    this.#profilesChangedHookId = hooks.on(`${MODULE_ID}.profilesChanged`, (changedProfileId) => {
      void this.#handleProfilesChanged(changedProfileId);
    });
  }

  async #handleProfilesChanged(_changedProfileId) {
    const profiles = this.#profileService.getProfiles();
    if (profiles.length === 0) return;

    const current = this.#profileService.getProfile(this.#profile?.id);
    if (current) {
      this.#profile = current;
      if (this.rendered) await this.render();
      return;
    }

    const fallback = this.#profileService.getDefaultProfile() ?? profiles[0];
    if (!fallback) return;
    await this.#switchProfile(fallback.id);
  }

  async #switchProfile(profileId) {
    const profile = this.#profileService.getProfile(profileId);
    if (!profile || profile.id === this.#profile?.id) return;

    const state = this.#cartService.getState();
    const hadCart = state.buyLines.length > 0 || state.sellLines.length > 0;
    if (hadCart) { this.#cartService.clear("buy"); this.#cartService.clear("sell"); }

    this.#profile = profile;
    this.#catalogFilters = updateCatalogViewState(this.#catalogFilters, "sourcePack", "all");
    this.#spellView = updateSpellViewState(this.#spellView, "sourcePack", "all");
    this.#spellView = updateSpellViewState(this.#spellView, "selectedSpellUuid", null);
    this.#expandedItems.clear();
    this.#previews.clear();
    this.#previewErrors.clear();
    this.#expandedSpells.clear();
    this.#spellPreviews.clear();
    this.#spellPreviewErrors.clear();
    this.#checkoutState = null;
    this.#checkoutOperationId = null;

    if (hadCart) {
      ui.notifications?.info?.(game.i18n.localize("PF2E_MARKET_FORGE.Profiles.CartClearedOnSwitch"));
    }
    await this.render();
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

  #levelCalculationLabel(levelContext) {
    const limit = this.#profile?.availability?.levelLimit;
    const result = levelContext?.result;
    if (!limit || limit.mode === "unlimited" || !result) {
      return game.i18n.localize("PF2E_MARKET_FORGE.Unlimited");
    }

    if (limit.mode === "fixed") {
      return game.i18n.format("PF2E_MARKET_FORGE.LevelCalculation.Fixed", {
        level: result.maximumItemLevel
      });
    }

    const raw = Number.isInteger(result.rawValue) ? String(result.rawValue) : result.rawValue.toFixed(1);
    const offset = result.offset === 0 ? "0" : result.offset > 0 ? `+${result.offset}` : String(result.offset);
    return game.i18n.format("PF2E_MARKET_FORGE.LevelCalculation.Party", {
      raw,
      rounded: result.roundedValue,
      rounding: game.i18n.localize(`PF2E_MARKET_FORGE.Rounding.${limit.rounding}`),
      offset,
      maximum: result.maximumItemLevel
    });
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

function emptySpellCatalogResult() {
  return {
    entries: [],
    total: 0,
    truncated: false,
    facets: { ranks: [], traditions: [], rarities: [], sources: [] },
    sources: []
  };
}
