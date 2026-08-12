import { MODULE_ID } from "../core/constants.js";
import { WorldMarketProfileService } from "../market/world-profile-service.js";
import { MarketPermissionService } from "../permissions/permission-service.js";

export class MarketLauncher {
  #application = null;
  #profileService;
  #permissionService;

  constructor({ profileService, permissionService } = {}) {
    this.#profileService = profileService ?? new WorldMarketProfileService();
    this.#permissionService = permissionService ?? new MarketPermissionService();
  }

  async open(options = {}) {
    if (globalThis.game?.system?.id !== "pf2e") {
      globalThis.ui?.notifications?.error?.(
        globalThis.game?.i18n?.localize?.("PF2E_MARKET_FORGE.Errors.PF2EOnly") ??
        "PF2E Market Forge can only be used with the Pathfinder 2e system."
      );
      return false;
    }

    const actor = await this.#resolveActor(options.actorUuid);
    if (!actor) {
      globalThis.ui?.notifications?.warn?.(
        globalThis.game?.i18n?.localize?.("PF2E_MARKET_FORGE.Errors.NoActor") ??
        "No suitable actor is available for Market Forge."
      );
      return false;
    }

    const canOpen = await this.#permissionService.canOpen(globalThis.game?.user?.id, actor.uuid);
    if (!canOpen) {
      globalThis.ui?.notifications?.warn?.(
        globalThis.game?.i18n?.localize?.("PF2E_MARKET_FORGE.Errors.PermissionDenied") ??
        "You do not have permission to use Market Forge for this actor."
      );
      return false;
    }

    const requestedProfileId = options.profileId ?? this.#profileService.getDefaultProfileId();
    const profile = this.#profileService.getProfile(requestedProfileId) ?? this.#profileService.getDefaultProfile();
    const { MarketApplication } = await import("../applications/market-application.js");

    if (this.#application?.rendered) await this.#application.close();
    this.#application = new MarketApplication({ actor, launchOptions: options, profile, profileService: this.#profileService });
    await this.#application.render({ force: true });

    console.debug(`${MODULE_ID} | Market Forge opened`, { actor: actor.uuid, profile: profile?.id, options });
    return true;
  }

  async #resolveActor(actorUuid) {
    if (actorUuid) {
      try {
        const resolved = typeof globalThis.fromUuid === "function" ? await globalThis.fromUuid(actorUuid) : null;
        if (resolved && ["character", "party"].includes(resolved.type)) return resolved;
      } catch (_error) {
        // Fall through to normal fallback selection.
      }
    }

    const assigned = globalThis.game?.user?.character;
    if (assigned && ["character", "party"].includes(assigned.type)) return assigned;

    const activeParty = globalThis.game?.actors?.party;
    if (activeParty) return activeParty;

    const actors = globalThis.game?.actors?.contents ?? [];
    return actors.find((actor) => ["character", "party"].includes(actor.type) && actor.canUserModify?.(globalThis.game.user, "update")) ?? null;
  }
}
