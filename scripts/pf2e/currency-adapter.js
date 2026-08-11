import { coinsToCopper } from "../core/money.js";

export class CurrencyAdapter {
  #actorProvider;

  constructor({ actorProvider } = {}) {
    this.#actorProvider = actorProvider ?? defaultActorProvider;
  }

  async getBalance(actorUuid) {
    const actor = await this.#actorProvider(actorUuid);
    if (!actor) throw new RangeError(`Actor not found: ${actorUuid}`);
    return actorCurrencyToCopper(actor);
  }

  async canAfford(actorUuid, amount) {
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new TypeError("Amount must be a non-negative safe integer.");
    }
    return (await this.getBalance(actorUuid)) >= amount;
  }

  async remove() { return notImplemented("remove"); }
  async add() { return notImplemented("add"); }
}

export function actorCurrencyToCopper(actor) {
  const currency = actor?.inventory?.currency ?? actor?.inventory?.coins ?? null;
  const copperValue = Number(currency?.copperValue);
  if (Number.isSafeInteger(copperValue) && copperValue >= 0) return copperValue;

  return coinsToCopper({
    pp: safeCoin(currency?.pp),
    gp: safeCoin(currency?.gp),
    sp: safeCoin(currency?.sp),
    cp: safeCoin(currency?.cp)
  });
}

async function defaultActorProvider(actorUuid) {
  if (!actorUuid) return null;

  const actors = globalThis.game?.actors;
  const actorId = String(actorUuid).startsWith("Actor.") ? String(actorUuid).slice(6) : null;
  const actor = actorId ? actors?.get?.(actorId) : null;
  if (actor) return actor;

  if (typeof globalThis.fromUuid === "function") {
    return globalThis.fromUuid(actorUuid);
  }

  return null;
}

function safeCoin(value) {
  const number = Number(value ?? 0);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function notImplemented(method) {
  throw new Error(`PF2E Market Forge: CurrencyAdapter.${method} is not implemented.`);
}
