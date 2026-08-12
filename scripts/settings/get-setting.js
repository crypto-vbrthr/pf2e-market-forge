import { MODULE_ID } from "../core/constants.js";

export function getSetting(key, fallback = true) {
  try {
    return globalThis.game?.settings?.get?.(MODULE_ID, key) ?? fallback;
  } catch (_error) {
    return fallback;
  }
}
