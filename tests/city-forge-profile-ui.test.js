import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const template = fs.readFileSync(path.join(root, "templates", "market-profiles.hbs"), "utf8");
const application = fs.readFileSync(path.join(root, "scripts", "applications", "market-profiles-application.js"), "utf8");

test("profile editor can choose manual or live City Forge availability", () => {
  assert.ok(template.includes('data-profile-field="availability.provider.type"'));
  assert.ok(template.includes('data-profile-field="availability.provider.sourceId"'));
  assert.ok(template.includes("PF2E_MARKET_FORGE.CityForge.LiveHint"));
  assert.ok(application.includes("this.#cityForgeProvider.listSources()"));
});

test("manual level and rarity controls are disabled while City Forge is live", () => {
  assert.ok(template.includes('data-profile-field="availability.levelLimit.mode" {{#if draft.cityForgeMode}}disabled{{/if}}'));
  assert.ok(template.includes('data-profile-field="availability.rarities.common" {{#if draft.cityForgeMode}}disabled{{/if}}'));
  assert.ok(template.includes('data-profile-field="availability.rarities.unique" {{#if draft.cityForgeMode}}disabled{{/if}}'));
});
