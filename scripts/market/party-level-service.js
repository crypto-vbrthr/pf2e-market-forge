import { LEVEL_LIMIT_MODES, LEVEL_ROUNDING } from "../core/constants.js";

export function resolveMaximumItemLevel(levelLimit, memberLevels = []) {
  if (!levelLimit || !LEVEL_LIMIT_MODES.includes(levelLimit.mode)) {
    throw new TypeError("Invalid level-limit mode.");
  }
  if (!LEVEL_ROUNDING.includes(levelLimit.rounding)) {
    throw new TypeError("Invalid level rounding.");
  }
  if (!Number.isSafeInteger(levelLimit.offset)) {
    throw new TypeError("Level offset must be an integer.");
  }

  if (levelLimit.mode === "unlimited") return null;

  if (levelLimit.mode === "fixed") {
    if (!Number.isSafeInteger(levelLimit.fixedLevel) || levelLimit.fixedLevel < 0) {
      throw new TypeError("Fixed level must be a non-negative integer.");
    }
    return {
      memberLevels: [],
      rawValue: levelLimit.fixedLevel,
      roundedValue: levelLimit.fixedLevel,
      offset: 0,
      maximumItemLevel: levelLimit.fixedLevel
    };
  }

  validateMemberLevels(memberLevels);
  if (memberLevels.length === 0) throw new RangeError("Party-derived level limits require at least one member level.");

  let rawValue;
  switch (levelLimit.mode) {
    case "party-average":
      rawValue = memberLevels.reduce((sum, level) => sum + level, 0) / memberLevels.length;
      break;
    case "party-highest":
      rawValue = Math.max(...memberLevels);
      break;
    case "party-lowest":
      rawValue = Math.min(...memberLevels);
      break;
  }

  const roundedValue = roundLevel(rawValue, levelLimit.rounding);
  const maximumItemLevel = Math.max(0, roundedValue + levelLimit.offset);

  return {
    memberLevels: [...memberLevels],
    rawValue,
    roundedValue,
    offset: levelLimit.offset,
    maximumItemLevel
  };
}

function validateMemberLevels(levels) {
  if (!Array.isArray(levels)) throw new TypeError("Member levels must be an array.");
  for (const level of levels) {
    if (!Number.isSafeInteger(level) || level < 0) {
      throw new TypeError("Party member levels must be non-negative integers.");
    }
  }
}

function roundLevel(value, mode) {
  if (mode === "floor") return Math.floor(value);
  if (mode === "ceil") return Math.ceil(value);
  return Math.round(value);
}
