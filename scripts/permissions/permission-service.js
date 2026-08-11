export class MarketPermissionService {
  async canOpen(userId, actorUuid) {
    const user = globalThis.game?.users?.get?.(userId) ?? globalThis.game?.user;
    const actor = await resolveActor(actorUuid);
    return canOpenActor(actor, user);
  }

  async canBuy() { return false; }
  async canSell() { return false; }
}

export function canOpenActor(actor, user) {
  if (!actor || !user) return false;
  if (!["character", "party"].includes(actor.type)) return false;
  if (user.isGM) return true;
  return typeof actor.canUserModify === "function" && actor.canUserModify(user, "update");
}

async function resolveActor(uuid) {
  if (!uuid) return null;
  if (typeof globalThis.fromUuid === "function") {
    try {
      return await globalThis.fromUuid(uuid);
    } catch (_error) {
      return null;
    }
  }
  const id = String(uuid).startsWith("Actor.") ? String(uuid).slice(6) : String(uuid);
  return globalThis.game?.actors?.get?.(id) ?? null;
}
