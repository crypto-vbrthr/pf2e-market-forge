import { coinsToCopper } from "../core/money.js";

const SELLABLE_TYPES = new Set([
  "ammo",
  "armor",
  "backpack",
  "book",
  "consumable",
  "equipment",
  "shield",
  "treasure",
  "weapon"
]);

export class SaleInventoryService {
  #inventoryAdapter;

  constructor({ inventoryAdapter } = {}) {
    if (!inventoryAdapter) throw new TypeError("SaleInventoryService requires an InventoryAdapter.");
    this.#inventoryAdapter = inventoryAdapter;
  }

  async list(actorUuid) {
    const items = await this.#inventoryAdapter.getInventory(actorUuid);
    return items
      .map((item) => mapOwnedItem(item, { actorUuid }))
      .filter(Boolean)
      .sort(compareSaleEntries);
  }

  async getEntry(actorUuid, itemUuid) {
    if (!itemUuid) return null;
    const item = await this.#inventoryAdapter.getItem(itemUuid);
    if (!item) return null;
    const entry = mapOwnedItem(item, { actorUuid });
    if (!entry || entry.actorUuid !== actorUuid) return null;
    return entry;
  }
}

export function mapOwnedItem(item, { actorUuid = null } = {}) {
  if (!item || typeof item !== "object") return null;
  const itemType = String(item.type ?? "");
  if (!SELLABLE_TYPES.has(itemType)) return null;

  const parentActorUuid = item.actor?.uuid ?? item.parent?.uuid ?? actorUuid ?? null;
  if (!parentActorUuid) return null;
  if (actorUuid && parentActorUuid !== actorUuid) return null;

  const quantity = Math.max(0, Math.trunc(Number(item.quantity ?? item.system?.quantity ?? 0) || 0));
  const price = item.price ?? item.system?.price ?? {};
  const pricePer = Math.max(1, Math.trunc(Number(price?.per ?? item.system?.price?.per ?? 1) || 1));
  const stackPrice = coinsValueToCopper(price?.value ?? item.system?.price?.value ?? {});
  const baseUnitPrice = Math.floor(stackPrice / pricePer);
  const treasureCategory = itemType === "treasure" ? String(item.system?.category ?? "") : null;
  const traits = item.traits instanceof Set
    ? [...item.traits]
    : Array.isArray(item.system?.traits?.value)
      ? [...item.system.traits.value]
      : [];

  const reasons = [];
  const isPartyInventory = isPartyOwnedItem(item);
  if (isCurrencyItem(item, treasureCategory)) reasons.push("currency");
  if (item.isTemporary === true || item.system?.temporary === true || traits.includes("infused")) reasons.push("temporary");
  if (isExplicitlyUnidentified(item)) reasons.push("unidentified");
  // PF2e's `isEquipped` is a rules-activation concept: items whose usage is `carried`
  // are considered equipped even when they are merely in inventory. It is therefore
  // too broad to use directly as a sale restriction. Party stashes also cannot
  // meaningfully equip or invest items, even if stale item state survived a transfer.
  if (!isPartyInventory && itemType !== "treasure" && isActivelyEquippedForSale(item)) reasons.push("equipped");
  if (!isPartyInventory && item.isInvested === true) reasons.push("invested");
  // Prefer PF2e's resolved container state. A raw containerId can be stale after an
  // inventory move and must not by itself make an otherwise loose item unsellable.
  if (isActuallyInContainer(item)) reasons.push("in-container");
  if (hasSubitems(item)) reasons.push("has-subitems");
  if (quantity < 1) reasons.push("no-quantity");
  if (stackPrice < 1) reasons.push("no-value");

  const uuid = String(item.uuid ?? "");
  if (!uuid) return null;

  return {
    uuid,
    actorUuid: parentActorUuid,
    itemId: String(item.id ?? item._id ?? ""),
    name: String(item.name ?? ""),
    img: String(item.img ?? "icons/svg/item-bag.svg"),
    itemType,
    category: treasureCategory || itemType,
    treasureCategory,
    level: Math.trunc(Number(item.level ?? item.system?.level?.value ?? 0) || 0),
    rarity: String(item.rarity ?? item.system?.traits?.rarity ?? "common"),
    traits,
    quantity,
    availableQuantity: quantity,
    baseUnitPrice,
    pricePer,
    stackPrice,
    availability: {
      available: reasons.length === 0,
      reasons
    }
  };
}


function isPartyOwnedItem(item) {
  return (item.actor?.type ?? item.parent?.type ?? null) === "party";
}

function isActivelyEquippedForSale(item) {
  const usage = item.system?.usage;
  const usageType = typeof usage?.type === "string"
    ? usage.type
    : inferUsageType(usage?.value);

  // PF2e deliberately reports `carried` usage as equipped because carried-item rule
  // effects are active. Market Forge only wants to prevent selling items that are
  // actually held/worn/attached/installed/implanted.
  if (usageType === "carried") return false;
  return item.isEquipped === true;
}

function inferUsageType(value) {
  const usage = String(value ?? "");
  if (!usage || usage === "carried") return "carried";
  if (usage.startsWith("held-in-")) return "held";
  if (usage.startsWith("attached-to-")) return "attached";
  if (usage.startsWith("installed-in-")) return "installed";
  if (usage === "implanted") return "implanted";
  if (usage.startsWith("worn")) return "worn";
  return null;
}

function isActuallyInContainer(item) {
  if (typeof item.isInContainer === "boolean") return item.isInContainer;
  return Boolean(item.system?.containerId);
}

function isCurrencyItem(item, treasureCategory) {
  if (item.isCurrency === true || item.isCoinage === true) return true;
  if (item.type !== "treasure") return false;
  return treasureCategory === "coin" || treasureCategory === "credstick" || item.system?.slug === "upb";
}

function isExplicitlyUnidentified(item) {
  if (typeof item.isIdentified === "boolean") return !item.isIdentified;
  const status = item.system?.identification?.status;
  return typeof status === "string" && status !== "identified";
}

function hasSubitems(item) {
  const collectionSize = Number(item.subitems?.size ?? 0);
  if (collectionSize > 0) return true;
  return Array.isArray(item.system?.subitems) && item.system.subitems.length > 0;
}

function coinsValueToCopper(value) {
  const copperValue = Number(value?.copperValue);
  if (Number.isSafeInteger(copperValue) && copperValue >= 0) return copperValue;
  return coinsToCopper({
    pp: safeCoin(value?.pp),
    gp: safeCoin(value?.gp),
    sp: safeCoin(value?.sp),
    cp: safeCoin(value?.cp)
  });
}

function safeCoin(value) {
  const number = Number(value ?? 0);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function compareSaleEntries(a, b) {
  return a.itemType.localeCompare(b.itemType) || a.name.localeCompare(b.name) || a.uuid.localeCompare(b.uuid);
}
