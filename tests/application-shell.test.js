import assert from "node:assert/strict";
import { describe, it } from "node:test";

class FakeApplicationV2 {
  static DEFAULT_OPTIONS = {};
  constructor() {
    this.element = { querySelectorAll: () => [], querySelector: () => null };
    this.rendered = false;
    this.renderCount = 0;
  }
  async _prepareContext() { return {}; }
  async _onRender() {}
  async render() { this.rendered = true; this.renderCount += 1; return this; }
}

globalThis.foundry = {
  applications: {
    api: {
      ApplicationV2: FakeApplicationV2,
      HandlebarsApplicationMixin: (Base) => class extends Base {}
    }
  }
};


let nextHookId = 1;
const hookListeners = new Map();
globalThis.Hooks = {
  on(name, callback) {
    const id = nextHookId++;
    if (!hookListeners.has(name)) hookListeners.set(name, new Map());
    hookListeners.get(name).set(id, callback);
    return id;
  },
  off(name, id) {
    return hookListeners.get(name)?.delete(id) ?? false;
  },
  callAll(name, ...args) {
    for (const callback of hookListeners.get(name)?.values() ?? []) callback(...args);
  }
};

globalThis.game = {
  i18n: {
    localize: (key) => key,
    format: (key, data = {}) => `${key}:${JSON.stringify(data)}`
  },
  actors: { party: null },
  user: { id: "User.test" },
  settings: { get: (_namespace, key) => { if (key === "marketListLimit") return 200; throw new Error("not registered in unit test"); } }
};

describe("ApplicationV2 shell", () => {
  it("loads Milestone 7.1 catalog with the configured list limit and empty purchase-cart context", async () => {
    const { MarketApplication } = await import("../scripts/applications/market-application.js");
    let searched = false;
    let receivedLimit = null;
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
        async search(options) {
          searched = true;
          receivedLimit = options.limit;
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
    assert.equal(context.milestone, "7.1");
    assert.equal(receivedLimit, 200);
    assert.equal(searched, true);
    assert.equal(MarketApplication.PARTS.main.template, "modules/pf2e-market-forge/templates/market.hbs");
  });

  it("refreshes an already-open market when market profiles change", async () => {
    const { MarketApplication } = await import("../scripts/applications/market-application.js");
    const { createDefaultMarketProfile } = await import("../scripts/market/profile-defaults.js");
    const profiles = [createDefaultMarketProfile({ id: "default", name: "Default Market" })];
    const profileService = {
      getProfiles: () => structuredClone(profiles),
      getProfile: (id) => structuredClone(profiles.find((profile) => profile.id === id) ?? null),
      getDefaultProfileId: () => "default",
      getDefaultProfile: () => structuredClone(profiles[0])
    };
    const app = new MarketApplication({
      actor: {
        uuid: "Actor.profile-refresh",
        name: "Profile Tester",
        img: "icons/svg/mystery-man.svg",
        type: "character",
        level: 5,
        inventory: { contents: [], currency: { gp: 10 } }
      },
      launchOptions: { initialMode: "buy" },
      profile: profiles[0],
      profileService,
      catalogService: {
        async search() {
          return { entries: [], total: 0, truncated: false, facets: { categories: [], levels: [], rarities: [], sources: [] }, sources: [] };
        },
        async getEntry() { return null; }
      },
      previewService: { getPreview: async () => null, openSheet: async () => false }
    });

    await app.render({ force: true });
    const rendersBefore = app.renderCount;
    profiles.push(createDefaultMarketProfile({ id: "new-market", name: "New Market" }));
    globalThis.Hooks.callAll("pf2e-market-forge.profilesChanged", "new-market");
    await new Promise((resolve) => setTimeout(resolve, 0));

    const context = await app._prepareContext({});
    assert.ok(app.renderCount > rendersBefore);
    assert.deepEqual(context.profileOptions.map((entry) => entry.id), ["default", "new-market"]);

    app._onClose?.({});
  });
});
