import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MarketDiagnosticsService } from "../scripts/diagnostics/market-diagnostics.js";
import { MarketForgeAPI } from "../scripts/api/market-api.js";

describe("release diagnostics contract", () => {
  it("exposes a compact JSON-safe module/transport/profile/capability snapshot", async () => {
    const oldGame = globalThis.game;
    globalThis.game = {
      version: "14.365",
      system: { id: "pf2e", version: "7.4.0" },
      user: { id: "User.gm", isGM: true },
      modules: { get: () => ({ version: "0.1.0" }) }
    };
    try {
      const service = new MarketDiagnosticsService({
        profileService: {
          getProfiles: () => [{ id: "default" }, { id: "city" }],
          getDefaultProfileId: () => "city"
        },
        capabilityService: {
          checkGlobal: () => ({ compatible: true, errors: [], warnings: [] }),
          assertWritableActor: () => ({ compatible: true, errors: [], missing: [] })
        },
        socket: {
          getDiagnostics: () => ({ authorityGmId: "User.gm", hasClientAuthoritySession: false })
        },
        actorProvider: async () => ({ uuid: "Actor.party", type: "party" })
      });

      const report = await service.diagnose({ actorUuid: "Actor.party" });
      assert.equal(report.moduleId, "pf2e-market-forge");
      assert.equal(report.moduleVersion, "0.1.0");
      assert.equal(report.profiles.count, 2);
      assert.equal(report.profiles.defaultProfileId, "city");
      assert.equal(report.actorCapability.compatible, true);
      assert.equal(report.transport.authorityGmId, "User.gm");
      assert.doesNotThrow(() => JSON.stringify(report));
    } finally {
      globalThis.game = oldGame;
    }
  });

  it("keeps diagnose on the intentionally small public API", () => {
    assert.equal(typeof MarketForgeAPI.prototype.open, "function");
    assert.equal(typeof MarketForgeAPI.prototype.getProfiles, "function");
    assert.equal(typeof MarketForgeAPI.prototype.getProfile, "function");
    assert.equal(typeof MarketForgeAPI.prototype.getDefaultProfile, "function");
    assert.equal(typeof MarketForgeAPI.prototype.diagnose, "function");
    assert.equal("quotePurchase" in MarketForgeAPI.prototype, false);
    assert.equal("quoteSale" in MarketForgeAPI.prototype, false);
  });
});
