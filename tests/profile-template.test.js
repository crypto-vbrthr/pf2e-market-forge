import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";

const market = fs.readFileSync(new URL("../templates/market.hbs", import.meta.url), "utf8");
const profiles = fs.readFileSync(new URL("../templates/market-profiles.hbs", import.meta.url), "utf8");

describe("Milestone 7 profile UI contract", () => {
  it("lets the market switch profiles and gives GMs a profile-manager entry point", () => {
    assert.match(market, /data-market-profile/);
    assert.match(market, /data-market-manage-profiles/);
  });

  it("exposes named profiles, per-profile rules, and separate item/spell compendium selectors", () => {
    assert.match(profiles, /data-profile-select/);
    assert.match(profiles, /availability\.levelLimit\.mode/);
    assert.match(profiles, /pricing\.buyMultiplier/);
    assert.match(profiles, /pricing\.sellMultiplier/);
    assert.match(profiles, /data-profile-source="itemCompendia"/);
    assert.match(profiles, /data-profile-source="spellCompendia"/);
    assert.match(profiles, /data-profile-default/);
  });
});
