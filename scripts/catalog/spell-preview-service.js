export class SpellPreviewService {
  #resolver;
  #enrichHtml;
  #cache = new Map();

  constructor({ resolver, enrichHtml } = {}) {
    this.#resolver = resolver ?? ((uuid) => globalThis.fromUuid?.(uuid));
    this.#enrichHtml = enrichHtml ?? defaultEnrichHtml;
  }

  clearCache(key = null) {
    if (key) this.#cache.delete(key);
    else this.#cache.clear();
  }

  async getPreview(uuid, castRank = null) {
    if (typeof uuid !== "string" || !uuid) throw new TypeError("Spell preview requires a spell UUID.");
    const key = `${uuid}#${castRank ?? "base"}`;
    if (this.#cache.has(key)) return this.#cache.get(key);
    const promise = this.#loadPreview(uuid, castRank);
    this.#cache.set(key, promise);
    try {
      return await promise;
    } catch (error) {
      this.#cache.delete(key);
      throw error;
    }
  }

  async openSheet(uuid) {
    const spell = await this.#resolver(uuid);
    if (!spell?.sheet?.render) return false;
    spell.sheet.render(true);
    return true;
  }

  async #loadPreview(uuid, castRank) {
    const spell = await this.#resolver(uuid);
    if (!spell || spell.type !== "spell") throw new Error(`PF2E Market Forge: spell preview target unavailable (${uuid}).`);
    const baseRank = Number(spell.baseRank ?? spell.system?.level?.value ?? 1);
    const rank = Number.isSafeInteger(castRank) ? Math.max(baseRank, Math.min(10, castRank)) : baseRank;
    const variant = typeof spell.loadVariant === "function" ? (spell.loadVariant({ castRank: rank }) ?? spell) : spell;
    const description = String(variant.description ?? variant.system?.description?.value ?? spell.description ?? "");
    const rollData = typeof variant.getRollData === "function" ? variant.getRollData({ castRank: rank }) : { castRank: rank, heighten: rank - baseRank };
    const renderedDescription = await this.#enrichHtml(description, { item: variant, rollData });
    const traits = setOrArray(variant.traits ?? variant.system?.traits?.value);
    const traditions = setOrArray(variant.traditions ?? variant.system?.traits?.traditions);

    return {
      uuid,
      name: String(spell.name ?? ""),
      img: String(spell.img ?? "icons/svg/book.svg"),
      baseRank,
      castRank: rank,
      rarity: String(spell.rarity ?? spell.system?.traits?.rarity ?? "common"),
      traits,
      traditions,
      renderedDescription,
      sourceLabel: String(spell.system?.publication?.title ?? spell.pack ?? ""),
      heightened: rank > baseRank,
      heightenBy: Math.max(0, rank - baseRank)
    };
  }
}

async function defaultEnrichHtml(description, { item, rollData }) {
  const editor = globalThis.TextEditor;
  if (!editor?.enrichHTML) return description;
  return editor.enrichHTML(description, { async: true, relativeTo: item, rollData, secrets: Boolean(item?.isOwner) });
}

function setOrArray(value) {
  if (value instanceof Set) return [...value];
  return Array.isArray(value) ? [...value] : [];
}
