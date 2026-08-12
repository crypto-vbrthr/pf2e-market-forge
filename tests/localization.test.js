import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

const read = (name) => JSON.parse(fs.readFileSync(new URL(`../lang/${name}`, import.meta.url), "utf8"));

describe("release localization contract", () => {
  it("keeps German and English localization key sets identical", () => {
    const de = read("de.json");
    const en = read("en.json");
    assert.deepEqual(Object.keys(de).sort(), Object.keys(en).sort());
  });

  it("localizes authority-session failures in both languages", () => {
    for (const language of [read("de.json"), read("en.json")]) {
      assert.ok(language["PF2E_MARKET_FORGE.TransactionError.authority-session-unavailable"]);
      assert.ok(language["PF2E_MARKET_FORGE.TransactionError.authority-session-invalid"]);
    }
  });
});
