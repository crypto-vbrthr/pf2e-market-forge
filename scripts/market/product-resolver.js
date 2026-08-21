import { CatalogService } from "../catalog/catalog-service.js";
import { SpellCatalogService } from "../catalog/spell-catalog-service.js";
import { SaleInventoryService } from "../inventory/sale-inventory-service.js";
import { InventoryAdapter } from "../pf2e/inventory-adapter.js";
import { hasSpellItemBaseConfig } from "../pf2e/capabilities.js";
import { SpellItemAdapter } from "../pf2e/spell-item-adapter.js";
import { SpellItemService } from "../spells/spell-item-service.js";
import { evaluateAvailability } from "./availability-service.js";

/**
 * Shared market-product resolver used by both local dry-run previews and the
 * authoritative GM checkout path. Keeping the rules here prevents UI and
 * authority code from drifting apart.
 */
export class MarketProductResolver {
  #catalogService;
  #spellCatalogService;
  #spellItemService;
  #spellItemAdapter;
  #saleInventoryService;

  constructor({
    catalogService = new CatalogService(),
    spellCatalogService = new SpellCatalogService(),
    spellItemService = new SpellItemService(),
    spellItemAdapter = new SpellItemAdapter(),
    saleInventoryService = null,
    inventoryAdapter = new InventoryAdapter()
  } = {}) {
    this.#catalogService = catalogService;
    this.#spellCatalogService = spellCatalogService;
    this.#spellItemService = spellItemService;
    this.#spellItemAdapter = spellItemAdapter;
    this.#saleInventoryService = saleInventoryService ?? new SaleInventoryService({ inventoryAdapter });
  }

  async resolve(product, { profile, maximumItemLevel = null, authoritative = false, direction = "buy", itemActorUuid = null, availabilitySession = null } = {}) {
    if (!product || typeof product !== "object" || !profile) return null;

    if (product.kind === "item") {
      if (direction === "sell" || product.inventoryItemUuid) {
        if (!itemActorUuid || !product.inventoryItemUuid) return null;
        return this.#saleInventoryService.getEntry(itemActorUuid, product.inventoryItemUuid);
      }
      if (typeof product.sourceUuid !== "string" || !product.sourceUuid) return null;
      return this.#catalogService.getEntry(product.sourceUuid, {
        profile,
        maximumItemLevel,
        fresh: authoritative,
        availabilitySession
      });
    }

    if (direction !== "buy" || !["scroll", "wand"].includes(product.kind)) return null;
    if (typeof product.spellUuid !== "string" || !product.spellUuid) return null;
    if (!Number.isSafeInteger(product.spellRank)) return null;

    const spellEntry = await this.#spellCatalogService.getEntry(product.spellUuid, {
      profile,
      fresh: authoritative,
      availabilitySession
    });
    if (!spellEntry) return null;

    const spell = await this.#spellCatalogService.getSpell(product.spellUuid);
    if (!spell) return null;

    const draft = this.#spellItemService.createDraft({
      kind: product.kind,
      spellUuid: spellEntry.uuid,
      spellName: spellEntry.name,
      baseRank: spellEntry.baseRank,
      castRank: product.spellRank,
      rarity: spellEntry.rarity,
      spellCost: spellEntry.cost
    });

    const providerAvailability = availabilitySession?.type === "city-forge"
      ? availabilitySession.evaluateEntry(
          { ...spellEntry, level: draft.itemLevel },
          { sourceKind: "spell", level: draft.itemLevel }
        )
      : null;

    const availability = evaluateAvailability(
      {
        level: draft.itemLevel,
        rarity: spellEntry.rarity,
        sourcePack: spellEntry.sourcePack
      },
      profile,
      { maximumItemLevel, sourceKind: "spell", providerAvailability }
    );

    availability.reasons = [...new Set([
      ...(availability.reasons ?? []),
      ...(draft.availability?.reasons ?? [])
    ])];
    availability.available = availability.reasons.length === 0;

    const typeEnabled = product.kind === "scroll"
      ? profile.spellItems?.scrolls === true
      : profile.spellItems?.wands === true;
    if (!typeEnabled) {
      availability.available = false;
      availability.reasons = [...new Set([...availability.reasons, "spell-item-type-disabled"])];
    }

    if (!hasSpellItemBaseConfig(product.kind, product.spellRank)) {
      availability.available = false;
      availability.reasons = [...new Set([...availability.reasons, "pf2e-incompatible"])];
    }

    draft.availability = availability;
    const uuid = `spell-product:${product.kind}:${product.spellUuid}:${product.spellRank}`;

    if (!draft.availability.available) {
      return {
        uuid,
        name: spellEntry.name,
        img: spellEntry.img,
        level: draft.itemLevel,
        rarity: spellEntry.rarity,
        sourcePack: spellEntry.sourcePack,
        baseUnitPrice: draft.baseUnitPrice,
        availability: draft.availability,
        purchaseSource: null
      };
    }

    const purchaseSource = await this.#spellItemAdapter.createSource(draft, { spell });
    return {
      uuid,
      name: purchaseSource.name,
      img: purchaseSource.img ?? spellEntry.img,
      level: draft.itemLevel,
      rarity: spellEntry.rarity,
      sourcePack: spellEntry.sourcePack,
      baseUnitPrice: draft.baseUnitPrice,
      availability: draft.availability,
      purchaseSource
    };
  }
}
