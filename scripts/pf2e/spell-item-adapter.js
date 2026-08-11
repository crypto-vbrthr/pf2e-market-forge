import { copperToCoins } from "../core/money.js";

const MAGIC_TRADITIONS = new Set(["arcane", "divine", "occult", "primal"]);

export class SpellItemAdapter {
  #resolver;
  #configProvider;
  #localize;
  #idFactory;

  constructor({ resolver, configProvider, localize, idFactory } = {}) {
    this.#resolver = resolver ?? ((uuid) => globalThis.fromUuid?.(uuid));
    this.#configProvider = configProvider ?? (() => globalThis.CONFIG?.PF2E?.spellcastingItems ?? null);
    this.#localize = localize ?? ((key, data) => globalThis.game?.i18n?.format?.(key, data) ?? key);
    this.#idFactory = idFactory ?? (() => globalThis.foundry?.utils?.randomID?.() ?? crypto.randomUUID().replaceAll("-", "").slice(0, 16));
  }

  async createScrollSource(draft, options = {}) {
    return this.#createSource("scroll", draft, options);
  }

  async createWandSource(draft, options = {}) {
    return this.#createSource("wand", draft, options);
  }

  async createSource(draft, options = {}) {
    if (draft?.kind === "scroll") return this.createScrollSource(draft, options);
    if (draft?.kind === "wand") return this.createWandSource(draft, options);
    throw new TypeError("Spell-item draft must be a scroll or wand.");
  }

  async #createSource(kind, draft, { spell = null } = {}) {
    validateDraft(kind, draft);
    const config = this.#configProvider();
    const data = config?.[kind] ?? null;
    const baseUuid = data?.compendiumUuids?.[draft.castRank] ?? null;
    if (!baseUuid) throw new RangeError(`PF2e does not provide a ${kind} base item for spell rank ${draft.castRank}.`);

    const baseItem = await this.#resolver(baseUuid);
    if (!baseItem || baseItem.type !== "consumable") throw new Error(`PF2E Market Forge: could not load PF2e ${kind} base item.`);
    const spellItem = spell ?? await this.#resolver(draft.spellUuid);
    if (!spellItem || spellItem.type !== "spell") throw new RangeError(`Spell not found: ${draft.spellUuid}`);

    const source = cloneSource(baseItem);
    source._id = null;
    source.system ??= {};
    source.system.traits ??= { rarity: "common", value: [] };

    const spellTraits = setOrArray(spellItem.system?.traits?.value);
    source.system.traits.value = [...new Set([...(source.system.traits.value ?? []), ...spellTraits])].sort();
    source.system.traits.rarity = String(spellItem.rarity ?? spellItem.system?.traits?.rarity ?? draft.rarity ?? "common");

    if (source.system.traits.value.includes("magical") && source.system.traits.value.some((trait) => MAGIC_TRADITIONS.has(trait))) {
      source.system.traits.value = source.system.traits.value.filter((trait) => trait !== "magical");
    }

    source.name = data?.nameTemplate
      ? this.#localize(data.nameTemplate, { name: spellItem.name, level: draft.castRank })
      : `${kind === "scroll" ? "Scroll" : "Wand"} of ${spellItem.name} (Rank ${draft.castRank})`;

    const originalDescription = String(source.system.description?.value ?? "");
    const sourceLink = String(spellItem.sourceId ?? spellItem.uuid ?? draft.spellUuid);
    source.system.description ??= { value: "" };
    source.system.description.value = `<p>@UUID[${sourceLink}]{${escapeLabel(spellItem.name)}}</p><hr>${originalDescription}`;

    const spellSource = cloneSource(spellItem);
    spellSource._id = this.#idFactory();
    spellSource.system ??= {};
    spellSource.system.location ??= {};
    spellSource.system.location.value = null;
    spellSource.system.location.heightenedLevel = draft.castRank;
    source.system.spell = spellSource;

    // Keep the rules-derived values authoritative even if a custom PF2e pack has stale template data.
    source.system.level ??= {};
    source.system.level.value = draft.itemLevel;
    source.system.price ??= {};
    source.system.price.value = copperToCoins(draft.baseUnitPrice);
    source.system.price.per = 1;

    return source;
  }
}

function validateDraft(kind, draft) {
  if (!draft || typeof draft !== "object") throw new TypeError("Spell-item draft is required.");
  if (draft.kind !== kind) throw new TypeError(`Expected ${kind} draft.`);
  if (typeof draft.spellUuid !== "string" || !draft.spellUuid) throw new TypeError("Spell UUID is required.");
  if (!Number.isSafeInteger(draft.castRank) || draft.castRank < 1 || draft.castRank > (kind === "scroll" ? 10 : 9)) {
    throw new RangeError(`Invalid ${kind} spell rank.`);
  }
  if (!Number.isSafeInteger(draft.itemLevel) || draft.itemLevel < 0) throw new TypeError("Spell item level is invalid.");
  if (!Number.isSafeInteger(draft.baseUnitPrice) || draft.baseUnitPrice < 0) throw new TypeError("Spell item price is invalid.");
}

function cloneSource(document) {
  const raw = typeof document?.toObject === "function" ? document.toObject() : document?._source ?? document;
  return structuredClone(raw);
}

function setOrArray(value) {
  if (value instanceof Set) return [...value];
  return Array.isArray(value) ? [...value] : [];
}

function escapeLabel(value) {
  return String(value ?? "").replaceAll("{", "&#123;").replaceAll("}", "&#125;");
}
