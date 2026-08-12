import { MODULE_ID } from "../core/constants.js";
import { canUseActor } from "./sheet-integration-helpers.js";
import { getSetting } from "../settings/get-setting.js";
import { SETTINGS } from "../settings/keys.js";

export function registerActorDirectoryIntegration() {
  Hooks.on("getActorContextOptions", (_application, options) => {
    if (!getSetting(SETTINGS.SHOW_ACTOR_CONTEXT_MENU, true)) return;

    options.push({
      name: "PF2E_MARKET_FORGE.Context.Open",
      icon: '<i class="fa-solid fa-coins"></i>',
      group: "system",
      condition: (entry) => {
        const actor = actorFromEntry(entry);
        return canUseActor(actor);
      },
      callback: (entry) => {
        const actor = actorFromEntry(entry);
        if (!actor) return;
        game.modules.get(MODULE_ID)?.api?.open?.({ actorUuid: actor.uuid, initialMode: "browse" });
      }
    });
  });
}

function actorFromEntry(entry) {
  const id = entry?.dataset?.entryId ?? entry?.dataset?.documentId ?? entry?.dataset?.actorId;
  return id ? game.actors.get(id) : null;
}
