const PHYSICAL_ITEM_TYPES = new Set([
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

export class ItemPreviewService {
  #resolver;
  #enrichHtml;
  #cache = new Map();

  constructor({ resolver, enrichHtml } = {}) {
    this.#resolver = resolver ?? ((uuid) => globalThis.fromUuid?.(uuid));
    this.#enrichHtml = enrichHtml ?? defaultEnrichHtml;
  }

  clearCache(uuid = null) {
    if (uuid) this.#cache.delete(uuid);
    else this.#cache.clear();
  }

  async getPreview(uuid) {
    if (!uuid || typeof uuid !== "string") throw new TypeError("ItemPreviewService requires an item UUID.");
    if (this.#cache.has(uuid)) return this.#cache.get(uuid);

    const promise = this.#loadPreview(uuid);
    this.#cache.set(uuid, promise);

    try {
      return await promise;
    } catch (error) {
      this.#cache.delete(uuid);
      throw error;
    }
  }

  async openSheet(uuid) {
    const item = await this.#resolver(uuid);
    if (!item?.sheet?.render) return false;
    item.sheet.render(true);
    return true;
  }

  async #loadPreview(uuid) {
    const item = await this.#resolver(uuid);
    if (!item || !PHYSICAL_ITEM_TYPES.has(item.type)) {
      throw new Error(`PF2E Market Forge: item preview target is unavailable or not physical (${uuid}).`);
    }

    const description = String(item.description ?? item.system?.description?.value ?? "");
    const rollData = typeof item.getRollData === "function" ? item.getRollData() : {};
    const renderedDescription = await this.#enrichHtml(description, { item, rollData });
    const traits = item.traits instanceof Set
      ? [...item.traits]
      : Array.isArray(item.system?.traits?.value)
        ? [...item.system.traits.value]
        : [];

    return {
      uuid,
      name: String(item.name ?? ""),
      img: String(item.img ?? "icons/svg/item-bag.svg"),
      level: Number(item.level ?? item.system?.level?.value ?? 0),
      rarity: String(item.rarity ?? item.system?.traits?.rarity ?? "common"),
      traits,
      renderedDescription,
      sourceLabel: String(item.system?.publication?.title ?? item.pack ?? ""),
      activation: activationLabel(item),
      usage: usageLabel(item),
      bulk: bulkLabel(item)
    };
  }
}

async function defaultEnrichHtml(description, { item, rollData }) {
  const editor = globalThis.TextEditor;
  if (!editor?.enrichHTML) return description;

  return editor.enrichHTML(description, {
    async: true,
    relativeTo: item,
    rollData,
    secrets: Boolean(item?.isOwner)
  });
}

function activationLabel(item) {
  const activation = item.system?.activate;
  if (!activation) return "";

  const actionCost = activation.actionCost ?? activation.action ?? null;
  if (typeof actionCost === "string") return actionCost;
  if (actionCost && typeof actionCost === "object") {
    const type = actionCost.type ?? "";
    const value = actionCost.value ?? "";
    return [value, type].filter((part) => part !== "" && part !== null).join(" ");
  }
  return "";
}

function usageLabel(item) {
  return String(item.system?.usage?.value ?? item.system?.usage?.type ?? "");
}

function bulkLabel(item) {
  const bulk = item.system?.bulk;
  if (bulk === null || bulk === undefined) return "";
  if (typeof bulk === "string" || typeof bulk === "number") return String(bulk);
  if (bulk.value !== undefined) return String(bulk.value);
  return "";
}
