import { MODULE_ID } from "../core/constants.js";
import { AuthoritativeMarketService } from "../transactions/authoritative-market-service.js";

const CHANNEL = `module.${MODULE_ID}`;
const CHECKOUT_QUERY = `${MODULE_ID}.checkout`;
const DEFAULT_TIMEOUT_MS = 30000;
let singleton = null;

/**
 * Market Forge inter-client transport.
 *
 * Economic checkout uses Foundry V14's targeted User#query RPC. The raw module
 * socket remains only for fire-and-forget broadcasts such as profile changes.
 */
export class MarketSocket {
  #socketProvider;
  #usersProvider;
  #currentUserProvider;
  #configProvider;
  #service;
  #registered = false;
  #queryRegistered = false;
  #timeoutMs;

  constructor({
    socketProvider = () => globalThis.game?.socket ?? null,
    usersProvider = () => globalThis.game?.users ?? null,
    currentUserProvider = () => globalThis.game?.user ?? null,
    configProvider = () => globalThis.CONFIG ?? null,
    authoritativeService = null,
    timeoutMs = DEFAULT_TIMEOUT_MS
  } = {}) {
    this.#socketProvider = socketProvider;
    this.#usersProvider = usersProvider;
    this.#currentUserProvider = currentUserProvider;
    this.#configProvider = configProvider;
    this.#service = authoritativeService ?? new AuthoritativeMarketService();
    this.#timeoutMs = timeoutMs;
  }

  /** Register the targeted Foundry User query. Call during init on every client. */
  registerQueries() {
    if (this.#queryRegistered) return true;
    const config = this.#configProvider();
    if (!config?.queries || typeof config.queries !== "object") return false;
    config.queries[CHECKOUT_QUERY] = (queryData) => this.#handleCheckoutQuery(queryData);
    this.#queryRegistered = true;
    return true;
  }

  /** Register the raw module socket used only for non-economic broadcasts. */
  register() {
    if (this.#registered) return true;
    const socket = this.#socketProvider();
    if (typeof socket?.on !== "function") return false;
    socket.on(CHANNEL, (message) => { void this.#onBroadcastMessage(message); });
    this.#registered = true;
    return true;
  }

  getAuthorityGmId() {
    const collection = this.#usersProvider();
    const designated = collection?.activeGM;
    if (designated?.active && designated?.isGM) return designated.id;

    const users = collectionValues(collection)
      .filter((user) => user?.active && user?.isGM)
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    return users[0]?.id ?? null;
  }

  async requestCheckout(request) {
    const user = this.#currentUserProvider();
    if (!user?.id) return failure(request?.direction, "requester-unavailable");

    const authorityGmId = this.getAuthorityGmId();
    if (!authorityGmId) return failure(request?.direction, "authority-unavailable");

    // A checkout initiated on the authority GM itself needs no inter-client RPC.
    if (user.id === authorityGmId) {
      try {
        return toWireResult(await this.#service.checkout(request, { requesterUserId: user.id }));
      } catch (error) {
        return failure(request?.direction, "authority-error", error);
      }
    }

    const authority = getCollectionEntry(this.#usersProvider(), authorityGmId);
    if (!authority?.active || !authority?.isGM || typeof authority.query !== "function") {
      return failure(request?.direction, "authority-unavailable");
    }

    try {
      const result = await authority.query(CHECKOUT_QUERY, {
        requesterUserId: user.id,
        request: jsonClone(request)
      }, { timeout: this.#timeoutMs });
      return toWireResult(result, request?.direction);
    } catch (error) {
      const code = looksLikeTimeout(error) ? "authority-timeout" : "authority-error";
      return failure(request?.direction, code, error);
    }
  }

  broadcastProfilesChanged(profileId) {
    const user = this.#currentUserProvider();
    if (!user?.isGM) return false;
    const socket = this.#socketProvider();
    if (typeof socket?.emit !== "function") return false;
    socket.emit(CHANNEL, {
      type: "profiles-changed",
      sourceUserId: user.id,
      profileId: String(profileId ?? "")
    });
    return true;
  }

  async #handleCheckoutQuery(queryData) {
    const user = this.#currentUserProvider();
    const authorityGmId = this.getAuthorityGmId();
    const direction = queryData?.request?.direction;

    // Queries are targeted, but still fail closed if this client is no longer the authority GM.
    if (!user?.id || !user.isGM || user.id !== authorityGmId) {
      return failure(direction, "authority-unavailable");
    }

    const requesterUserId = String(queryData?.requesterUserId ?? "");
    const requester = getCollectionEntry(this.#usersProvider(), requesterUserId);
    if (!requester || requester.active === false) {
      return failure(direction, "requester-unavailable");
    }

    try {
      const result = await this.#service.checkout(queryData?.request, { requesterUserId });
      return toWireResult(result, direction);
    } catch (error) {
      console.error?.(`${MODULE_ID} | Authoritative checkout query failed`, error);
      return failure(direction, "authority-error", error);
    }
  }

  async #onBroadcastMessage(message) {
    if (!message || typeof message !== "object") return;
    const user = this.#currentUserProvider();
    if (!user?.id) return;

    if (message.type === "profiles-changed") {
      if (message.sourceUserId === user.id) return;
      const source = getCollectionEntry(this.#usersProvider(), message.sourceUserId);
      if (!source?.active || !source?.isGM) return;
      globalThis.Hooks?.callAll?.(`${MODULE_ID}.profilesChanged`, message.profileId);
    }
  }
}

export function getMarketSocket() {
  singleton ??= new MarketSocket();
  return singleton;
}

export function setMarketSocketForTests(socket) {
  singleton = socket;
}

export { CHECKOUT_QUERY };

function collectionValues(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return [...collection];
  if (typeof collection.values === "function") return [...collection.values()];
  if (typeof collection[Symbol.iterator] === "function") return [...collection];
  return [];
}

function getCollectionEntry(collection, id) {
  if (!collection || !id) return null;
  return collection.get?.(id) ?? collectionValues(collection).find((entry) => entry?.id === id) ?? null;
}

function jsonClone(value) {
  // Foundry User queries require JSON-serializable payloads. Checkout requests are
  // intentionally primitives/UUIDs only, so a JSON round-trip is the strongest guard.
  return JSON.parse(JSON.stringify(value));
}

function toWireResult(result, direction = "buy") {
  if (!result || typeof result !== "object") return failure(direction, "authority-error");
  return {
    transactionId: result.transactionId == null ? null : String(result.transactionId),
    status: String(result.status ?? "failed"),
    direction: ["buy", "sell"].includes(result.direction) ? result.direction : (["buy", "sell"].includes(direction) ? direction : "buy"),
    total: Number.isSafeInteger(result.total) && result.total >= 0 ? result.total : 0,
    remainingBalance: Number.isSafeInteger(result.remainingBalance) && result.remainingBalance >= 0 ? result.remainingBalance : null,
    errors: stringArray(result.errors),
    warnings: stringArray(result.warnings),
    ...(result.cause ? { cause: String(result.cause) } : {}),
    ...(Array.isArray(result.rollbackErrors) ? { rollbackErrors: stringArray(result.rollbackErrors) } : {})
  };
}

function stringArray(value) {
  return Array.isArray(value) ? value.map((entry) => String(entry)) : [];
}

function looksLikeTimeout(error) {
  const text = `${error?.name ?? ""} ${error?.message ?? error ?? ""}`.toLowerCase();
  return text.includes("timeout") || text.includes("timed out") || text.includes("time out");
}

function failure(direction = "buy", code = "transaction-error", error = null) {
  return {
    transactionId: null,
    status: "failed",
    direction: ["buy", "sell"].includes(direction) ? direction : "buy",
    total: 0,
    remainingBalance: null,
    errors: [code],
    warnings: [],
    ...(error ? { cause: error instanceof Error ? error.message : String(error) } : {})
  };
}
