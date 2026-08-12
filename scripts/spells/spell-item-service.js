import { assertCopperValue } from "../core/money.js";
import { parseSpellExtraCost } from "./spell-cost.js";

export const SCROLL_PRICES = Object.freeze({
  1: 400,
  2: 1200,
  3: 3000,
  4: 7000,
  5: 15000,
  6: 30000,
  7: 60000,
  8: 130000,
  9: 300000,
  10: 800000
});

export const WAND_PRICES = Object.freeze({
  1: 6000,
  2: 16000,
  3: 36000,
  4: 70000,
  5: 150000,
  6: 300000,
  7: 650000,
  8: 1500000,
  9: 4000000
});

export class SpellItemService {
  createDraft({ kind, spellUuid, spellName, baseRank, castRank, rarity = "common", spellSource = null, spellCost = "" }) {
    if (!['scroll', 'wand'].includes(kind)) throw new TypeError("Spell item kind must be scroll or wand.");
    assertRank(baseRank, "baseRank");
    assertRank(castRank, "castRank");
    if (castRank < baseRank) throw new RangeError("Cast rank cannot be lower than the spell base rank.");

    const maximumRank = kind === "scroll" ? 10 : 9;
    if (castRank > maximumRank) throw new RangeError(`${kind} supports a maximum spell rank of ${maximumRank}.`);
    if (typeof spellUuid !== "string" || !spellUuid) throw new TypeError("spellUuid is required.");
    if (typeof spellName !== "string" || !spellName) throw new TypeError("spellName is required.");

    const itemLevel = kind === "scroll" ? 2 * castRank - 1 : 2 * castRank + 1;
    const table = kind === "scroll" ? SCROLL_PRICES : WAND_PRICES;
    const tablePrice = assertCopperValue(table[castRank], "spell item price");
    const parsedCost = parseSpellExtraCost(spellCost);
    const extraCost = kind === "scroll" && parsedCost.status === "fixed" ? parsedCost.copper : 0;
    const baseUnitPrice = assertCopperValue(tablePrice + extraCost, "spell item price");
    const reasons = kind === "scroll" && parsedCost.status === "unsupported" ? ["spell-extra-cost-unsupported"] : [];

    return {
      kind,
      spellUuid,
      spellName,
      baseRank,
      castRank,
      rarity,
      itemLevel,
      baseUnitPrice,
      tablePrice,
      extraCostCopper: extraCost,
      spellCost: parsedCost,
      spellSource: spellSource ? structuredClone(spellSource) : null,
      availability: {
        available: reasons.length === 0,
        reasons
      }
    };
  }
}

function assertRank(rank, label) {
  if (!Number.isSafeInteger(rank) || rank < 1 || rank > 10) {
    throw new RangeError(`${label} must be an integer from 1 through 10.`);
  }
}
