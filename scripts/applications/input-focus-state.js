export function captureInputFocus(input) {
  if (!input) return null;

  const documentRef = input.ownerDocument ?? globalThis.document ?? null;
  if (documentRef?.activeElement !== input) return null;

  return {
    selectionStart: normalizeSelectionIndex(input.selectionStart),
    selectionEnd: normalizeSelectionIndex(input.selectionEnd),
    selectionDirection: typeof input.selectionDirection === "string" ? input.selectionDirection : "none"
  };
}

export function restoreInputFocus(root, selector, focusState) {
  if (!focusState || !root?.querySelector || !selector) return false;
  const input = root.querySelector(selector);
  if (!input || typeof input.focus !== "function") return false;

  try {
    input.focus({ preventScroll: true });
  } catch {
    input.focus();
  }

  if (
    typeof input.setSelectionRange === "function" &&
    Number.isInteger(focusState.selectionStart) &&
    Number.isInteger(focusState.selectionEnd)
  ) {
    try {
      input.setSelectionRange(
        focusState.selectionStart,
        focusState.selectionEnd,
        focusState.selectionDirection ?? "none"
      );
    } catch {
      // Some input types do not expose a selectable text range. Keeping focus is still useful.
    }
  }

  return true;
}

function normalizeSelectionIndex(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}
