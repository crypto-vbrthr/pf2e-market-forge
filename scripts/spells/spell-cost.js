import { coinsToCopper } from "../core/money.js";

const VARIABLE_COST_PATTERN = /(?:\b(?:per|each|every|minimum|at least|or more|up to|times|x\s+the|per rank|per level|per target|pro rang|je(?:r|de|des|m|n)?|mindestens|bis zu|pro stufe|pro grad|pro ziel)\b|[×*]|\/\s*(?:rank|level|target|grad|stufe|ziel)\b)/i;
const MONEY_PATTERN = /(?<![\d.,])([0-9][0-9.,\s]*)\s*(pp|gp|sp|cp|pm|gm|sm|km)\b/gi;

/**
 * PF2e stores spell costs as free text. Parse only unambiguous fixed currency values.
 * Anything else is deliberately marked unsupported so a scroll is never silently underpriced.
 */
export function parseSpellExtraCost(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return { status: "none", copper: 0, raw: "", matches: [] };

  if (VARIABLE_COST_PATTERN.test(raw)) {
    return { status: "unsupported", copper: 0, raw, matches: [] };
  }

  const matches = [];
  for (const match of raw.matchAll(MONEY_PATTERN)) {
    const amount = parseIntegerAmount(match[1]);
    const denomination = normalizeDenomination(match[2]);
    if (!Number.isSafeInteger(amount) || amount < 0 || !denomination) {
      return { status: "unsupported", copper: 0, raw, matches: [] };
    }
    matches.push({ amount, denomination });
  }

  if (matches.length === 0) {
    return { status: "unsupported", copper: 0, raw, matches: [] };
  }

  const coins = { pp: 0, gp: 0, sp: 0, cp: 0 };
  for (const entry of matches) coins[entry.denomination] += entry.amount;
  return { status: "fixed", copper: coinsToCopper(coins), raw, matches };
}

function parseIntegerAmount(value) {
  const compact = String(value ?? "").replace(/\s+/g, "");
  if (!compact) return NaN;

  // Costs are whole coin amounts in PF2e data. Treat comma/dot groups of three as thousands separators.
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(compact)) {
    return Number(compact.replace(/[.,]/g, ""));
  }
  if (/^\d+$/.test(compact)) return Number(compact);
  return NaN;
}

function normalizeDenomination(value) {
  switch (String(value ?? "").toLowerCase()) {
    case "pp":
    case "pm": return "pp";
    case "gp":
    case "gm": return "gp";
    case "sp":
    case "sm": return "sp";
    case "cp":
    case "km": return "cp";
    default: return null;
  }
}
