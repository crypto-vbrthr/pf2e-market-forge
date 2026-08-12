import { LEVEL_LIMIT_MODES, LEVEL_ROUNDING } from "../core/constants.js";
import { getSetting, SETTINGS } from "../settings/register-settings.js";
import { createDefaultMarketProfile } from "./profile-defaults.js";

export const DEFAULT_LEVEL_SETTING_VALUES = Object.freeze({
  mode: "party-average",
  fixedLevel: 0,
  offset: 0,
  rounding: "floor"
});

export function readMarketLevelSettings(getter = getSetting) {
  return normalizeMarketLevelSettings({
    mode: getter(SETTINGS.MARKET_LEVEL_MODE, DEFAULT_LEVEL_SETTING_VALUES.mode),
    fixedLevel: getter(SETTINGS.MARKET_FIXED_LEVEL, DEFAULT_LEVEL_SETTING_VALUES.fixedLevel),
    offset: getter(SETTINGS.MARKET_LEVEL_OFFSET, DEFAULT_LEVEL_SETTING_VALUES.offset),
    rounding: getter(SETTINGS.MARKET_LEVEL_ROUNDING, DEFAULT_LEVEL_SETTING_VALUES.rounding)
  });
}

export function normalizeMarketLevelSettings(values = {}) {
  const mode = LEVEL_LIMIT_MODES.includes(values.mode) ? values.mode : DEFAULT_LEVEL_SETTING_VALUES.mode;
  const rounding = LEVEL_ROUNDING.includes(values.rounding) ? values.rounding : DEFAULT_LEVEL_SETTING_VALUES.rounding;
  const fixedLevel = clampInteger(values.fixedLevel, 0, 30, DEFAULT_LEVEL_SETTING_VALUES.fixedLevel);
  const offset = clampInteger(values.offset, -20, 20, DEFAULT_LEVEL_SETTING_VALUES.offset);

  return { mode, fixedLevel, offset, rounding };
}

export function applyMarketLevelSettings(profile, values = DEFAULT_LEVEL_SETTING_VALUES) {
  const normalized = normalizeMarketLevelSettings(values);
  const result = structuredClone(profile);
  result.availability ??= {};
  result.availability.levelLimit = {
    ...(result.availability.levelLimit ?? {}),
    mode: normalized.mode,
    fixedLevel: normalized.fixedLevel,
    offset: normalized.offset,
    rounding: normalized.rounding
  };
  return result;
}

export function createConfiguredMarketProfile(overrides = {}, getter = getSetting) {
  return applyMarketLevelSettings(createDefaultMarketProfile(overrides), readMarketLevelSettings(getter));
}

function clampInteger(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(numeric)));
}
