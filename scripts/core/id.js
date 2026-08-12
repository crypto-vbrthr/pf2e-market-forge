let fallbackSequence = 0;

/**
 * Generate a temporary runtime identifier without depending on crypto.randomUUID().
 *
 * Foundry's public randomID helper is preferred because it works for normal Foundry
 * clients regardless of whether the page is served from localhost, HTTPS, or a LAN URL.
 */
export function createRuntimeId(length = 24) {
  const foundryRandomId = globalThis.foundry?.utils?.randomID;
  if (typeof foundryRandomId === "function") {
    try {
      return foundryRandomId(length);
    } catch (_error) {
      // Continue to browser/runtime fallbacks.
    }
  }

  const cryptoObject = globalThis.crypto;
  if (typeof cryptoObject?.randomUUID === "function") {
    try {
      return cryptoObject.randomUUID();
    } catch (_error) {
      // randomUUID may be unavailable in a non-secure browsing context.
    }
  }

  if (typeof cryptoObject?.getRandomValues === "function") {
    try {
      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      const bytes = new Uint8Array(length);
      cryptoObject.getRandomValues(bytes);
      return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
    } catch (_error) {
      // Fall through to a collision-resistant-enough local runtime identifier.
    }
  }

  fallbackSequence += 1;
  return `mf-${Date.now().toString(36)}-${fallbackSequence.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
