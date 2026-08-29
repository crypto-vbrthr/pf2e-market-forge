import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { captureInputFocus, restoreInputFocus } from "../scripts/applications/input-focus-state.js";

function makeInput(documentRef, { start = 0, end = start, direction = "none" } = {}) {
  return {
    ownerDocument: documentRef,
    selectionStart: start,
    selectionEnd: end,
    selectionDirection: direction,
    focusOptions: null,
    restoredRange: null,
    focus(options) {
      this.focusOptions = options ?? null;
      documentRef.activeElement = this;
    },
    setSelectionRange(selectionStart, selectionEnd, selectionDirection) {
      this.restoredRange = [selectionStart, selectionEnd, selectionDirection];
    }
  };
}

describe("search input focus preservation", () => {
  it("restores focus and the cursor/selection after a rerender without scrolling", () => {
    const documentRef = { activeElement: null };
    const oldInput = makeInput(documentRef, { start: 4, end: 7, direction: "forward" });
    documentRef.activeElement = oldInput;

    const state = captureInputFocus(oldInput);
    assert.deepEqual(state, { selectionStart: 4, selectionEnd: 7, selectionDirection: "forward" });

    const newInput = makeInput(documentRef);
    const root = { querySelector: (selector) => selector === "[data-search]" ? newInput : null };
    assert.equal(restoreInputFocus(root, "[data-search]", state), true);
    assert.deepEqual(newInput.focusOptions, { preventScroll: true });
    assert.deepEqual(newInput.restoredRange, [4, 7, "forward"]);
  });

  it("does not reclaim focus if the user moved to another control before the delayed search rerender", () => {
    const documentRef = { activeElement: null };
    const searchInput = makeInput(documentRef, { start: 3, end: 3 });
    const otherControl = {};
    documentRef.activeElement = otherControl;

    const state = captureInputFocus(searchInput);
    assert.equal(state, null);

    const replacement = makeInput(documentRef);
    const root = { querySelector: () => replacement };
    assert.equal(restoreInputFocus(root, "[data-search]", state), false);
    assert.equal(documentRef.activeElement, otherControl);
  });
});
