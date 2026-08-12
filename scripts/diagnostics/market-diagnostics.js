import { API_VERSION, MODULE_ID, PROFILE_SCHEMA_VERSION } from "../core/constants.js";
import { WorldMarketProfileService } from "../market/world-profile-service.js";
import { PF2eCapabilityService } from "../pf2e/capabilities.js";
import { getMarketSocket } from "../socket/market-socket.js";

/** Return a JSON-safe diagnostics snapshot without exposing live Documents. */
export class MarketDiagnosticsService {
  #profileService;
  #capabilities;
  #socket;
  #actorProvider;

  constructor({
    profileService = new WorldMarketProfileService(),
    capabilityService = new PF2eCapabilityService(),
    socket = getMarketSocket(),
    actorProvider = defaultActorProvider
  } = {}) {
    this.#profileService = profileService;
    this.#capabilities = capabilityService;
    this.#socket = socket;
    this.#actorProvider = actorProvider;
  }

  async diagnose({ actorUuid = null } = {}) {
    const module = globalThis.game?.modules?.get?.(MODULE_ID) ?? null;
    const profiles = this.#profileService.getProfiles();
    const globalCapability = this.#capabilities.checkGlobal();
    let actorCapability = null;

    if (actorUuid) {
      const actor = await this.#actorProvider(actorUuid);
      actorCapability = actor
        ? {
            actorUuid: String(actor.uuid ?? actorUuid),
            actorType: String(actor.type ?? "unknown"),
            ...this.#capabilities.assertWritableActor(actor)
          }
        : {
            actorUuid: String(actorUuid),
            actorType: null,
            compatible: false,
            errors: ["actor-not-found"],
            missing: []
          };
    }

    return jsonSafe({
      moduleId: MODULE_ID,
      moduleVersion: module?.version ?? module?.manifest?.version ?? null,
      apiVersion: API_VERSION,
      profileSchemaVersion: PROFILE_SCHEMA_VERSION,
      foundryVersion: globalThis.game?.version ?? null,
      systemId: globalThis.game?.system?.id ?? null,
      systemVersion: globalThis.game?.system?.version ?? null,
      currentUserId: globalThis.game?.user?.id ?? null,
      currentUserIsGM: Boolean(globalThis.game?.user?.isGM),
      profiles: {
        count: profiles.length,
        defaultProfileId: this.#profileService.getDefaultProfileId(),
        ids: profiles.map((profile) => profile.id)
      },
      capabilities: globalCapability,
      actorCapability,
      transport: this.#socket?.getDiagnostics?.() ?? null
    });
  }
}

async function defaultActorProvider(uuid) {
  if (!uuid) return null;
  if (typeof globalThis.fromUuid === "function") {
    try {
      const actor = await globalThis.fromUuid(uuid);
      if (actor) return actor;
    } catch (_error) {
      // Fall through to the world Actor collection.
    }
  }
  const id = String(uuid).startsWith("Actor.") ? String(uuid).slice(6) : String(uuid);
  return globalThis.game?.actors?.get?.(id) ?? null;
}

function jsonSafe(value) {
  return JSON.parse(JSON.stringify(value));
}
