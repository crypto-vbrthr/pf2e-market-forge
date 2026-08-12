import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

describe("transaction hardening manifest", () => {
  it("requests a package-specific Foundry socket namespace", () => {
    const manifest = JSON.parse(fs.readFileSync(new URL("../module.json", import.meta.url), "utf8"));
    assert.equal(manifest.socket, true);
    assert.equal(manifest.version, "0.0.15");
  });
});
