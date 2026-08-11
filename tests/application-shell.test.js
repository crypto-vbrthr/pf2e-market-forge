import assert from "node:assert/strict";
import { describe, it } from "node:test";

class FakeApplicationV2 {
  static DEFAULT_OPTIONS = {};
  constructor() {
    this.element = { querySelectorAll: () => [], querySelector: () => null };
    this.rendered = false;
  }
  async _prepareContext() { return {}; }
  async _onRender() {}
  async render() { this.rendered = true; return this; }
}

globalThis.foundry = {
  applications: {
    api: {
      ApplicationV2: FakeApplicationV2,
      HandlebarsApplicationMixin: (Base) => class extends Base {}
    }
  }
};

globalThis.game = {
  i18n: {
    localize: (key) => key,
    format: (key, data = {}) => `${key}:${JSON.stringify(data)}`
  },
  actors: { party: null },
  user: { id: "User.test" }
};

describe("ApplicationV2 shell", () => {
  it("loads Milestone 6 catalog and empty purchase-cart context", async () => {
    const { MarketApplication } = await import("../scripts/applications/market-application.js");
    let searched = false;
    const app = new MarketApplication({
      actor: {
        uuid: "Actor.test",
        name: "Test Hero",
        img: "icons/svg/mystery-man.svg",
        type: "character",
        level: 5,
        inventory: { contents: [], currency: { gp: 10 } }
      },
      launchOptions: { initialMode: "buy" },
      catalogService: {
        async search() {
          searched = true;
          return {
            entries: [], total: 0, truncated: false,
            facets: { categories: [], levels: [], rarities: [], sources: [] },
            sources: []
          };
        },
        async getEntry() { return null; }
      },
      previewService: { getPreview: async () => null, openSheet: async () => false }
    });
    const context = await app._prepareContext({});
    assert.equal(context.actor.name, "Test Hero");
    assert.equal(context.actor.currency, "10 PF2E_MARKET_FORGE.Coins.gp");
    assert.equal(context.buyTab.active, true);
    assert.equal(context.profile.maximumItemLevel, 5);
    assert.equal(context.catalog.hasEntries, false);
    assert.equal(context.cart.count, 0);
    assert.equal(context.cart.quotedTotal, 0);
    assert.equal(context.milestone, "6");
    assert.equal(searched, true);
    assert.equal(MarketApplication.PARTS.main.template, "modules/pf2e-market-forge/templates/market.hbs");
  });
});
