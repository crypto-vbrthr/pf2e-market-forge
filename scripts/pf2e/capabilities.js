const SUPPORTED_ACTOR_TYPES = new Set(["character", "party"]);

export class PF2eCapabilityService {
  checkGlobal() {
    const errors = [];
    const warnings = [];
    if (globalThis.game?.system?.id !== "pf2e") errors.push("wrong-system");
    if (typeof globalThis.fromUuid !== "function") errors.push("missing-from-uuid");
    if (typeof globalThis.foundry?.utils?.randomID !== "function") warnings.push("missing-foundry-random-id");

    const spellcastingItems = globalThis.CONFIG?.PF2E?.spellcastingItems;
    const scrolls = Boolean(spellcastingItems?.scroll?.compendiumUuids);
    const wands = Boolean(spellcastingItems?.wand?.compendiumUuids);
    if (!scrolls) warnings.push("missing-scroll-config");
    if (!wands) warnings.push("missing-wand-config");

    return {
      compatible: errors.length === 0,
      canTrade: errors.length === 0,
      canCreateScrolls: errors.length === 0 && scrolls,
      canCreateWands: errors.length === 0 && wands,
      errors,
      warnings
    };
  }

  assertWritableActor(actor) {
    if (!actor || !SUPPORTED_ACTOR_TYPES.has(actor.type)) return fail("unsupported-actor");
    const inventory = actor.inventory;
    const requiredInventory = ["add", "addCurrency", "removeCurrency"];
    const missingInventory = requiredInventory.filter((name) => typeof inventory?.[name] !== "function");
    const requiredActor = ["updateEmbeddedDocuments", "deleteEmbeddedDocuments", "createEmbeddedDocuments", "canUserModify"];
    const missingActor = requiredActor.filter((name) => typeof actor?.[name] !== "function");
    if (!inventory?.currency && !inventory?.coins) missingInventory.push("currency");

    const missing = [...new Set([...missingInventory.map((name) => `inventory.${name}`), ...missingActor.map((name) => `actor.${name}`)])];
    return {
      compatible: missing.length === 0,
      errors: missing.length === 0 ? [] : ["pf2e-incompatible"],
      missing
    };
  }
}

function fail(reason) {
  return { compatible: false, errors: ["pf2e-incompatible"], missing: [reason] };
}

export function hasSpellItemBaseConfig(kind, rank, config = globalThis.CONFIG?.PF2E?.spellcastingItems) {
  if (!["scroll", "wand"].includes(kind)) return false;
  if (!Number.isSafeInteger(rank) || rank < 1 || rank > (kind === "scroll" ? 10 : 9)) return false;
  return typeof config?.[kind]?.compendiumUuids?.[rank] === "string" && config[kind].compendiumUuids[rank].length > 0;
}

export function hasAnySpellItemBaseConfig(kind, { minimumRank = 1, maximumRank = kind === "scroll" ? 10 : 9, config = globalThis.CONFIG?.PF2E?.spellcastingItems } = {}) {
  const min = Math.max(1, Math.trunc(Number(minimumRank) || 1));
  const maxAllowed = kind === "scroll" ? 10 : 9;
  const max = Math.min(maxAllowed, Math.max(min, Math.trunc(Number(maximumRank) || maxAllowed)));
  for (let rank = min; rank <= max; rank += 1) {
    if (hasSpellItemBaseConfig(kind, rank, config)) return true;
  }
  return false;
}
