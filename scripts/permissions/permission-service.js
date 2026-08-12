export class MarketPermissionService {
  async canOpen(userId, actorUuid) {
    const user = resolveUser(userId);
    const actor = await resolveActor(actorUuid);
    return canOpenActor(actor, user);
  }

  async canBuy(userId, itemActorUuid, currencyActorUuid = itemActorUuid) {
    return canTrade(userId, itemActorUuid, currencyActorUuid);
  }

  async canSell(userId, itemActorUuid, currencyActorUuid = itemActorUuid) {
    return canTrade(userId, itemActorUuid, currencyActorUuid);
  }
}

export function canOpenActor(actor, user) {
  if (!actor || !user) return false;
  if (!["character", "party"].includes(actor.type)) return false;
  if (user.isGM) return true;
  return typeof actor.canUserModify === "function" && actor.canUserModify(user, "update");
}

export async function canTrade(userId, itemActorUuid, currencyActorUuid = itemActorUuid) {
  const user = resolveUser(userId);
  if (!user) return false;
  const itemActor = await resolveActor(itemActorUuid);
  const currencyActor = currencyActorUuid === itemActorUuid ? itemActor : await resolveActor(currencyActorUuid);
  return canModifyActor(itemActor, user) && canModifyActor(currencyActor, user);
}

function canModifyActor(actor, user) {
  if (!actor || !user || !["character", "party"].includes(actor.type)) return false;
  if (user.isGM) return true;
  return typeof actor.canUserModify === "function" && actor.canUserModify(user, "update");
}

function resolveUser(userId) {
  return globalThis.game?.users?.get?.(userId) ?? (globalThis.game?.user?.id === userId ? globalThis.game.user : null);
}

async function resolveActor(uuid) {
  if (!uuid) return null;
  if (typeof globalThis.fromUuid === "function") {
    try {
      const actor = await globalThis.fromUuid(uuid);
      if (actor) return actor;
    } catch (_error) {
      // Fall through to world actor collection.
    }
  }
  const id = String(uuid).startsWith("Actor.") ? String(uuid).slice(6) : String(uuid);
  return globalThis.game?.actors?.get?.(id) ?? null;
}
