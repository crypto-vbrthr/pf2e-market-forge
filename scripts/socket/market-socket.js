import { MODULE_ID } from "../core/constants.js";
import { createRuntimeId } from "../core/id.js";
import { AuthoritativeMarketService } from "../transactions/authoritative-market-service.js";

const CHANNEL = `module.${MODULE_ID}`;
const CHECKOUT_QUERY = `${MODULE_ID}.checkout`;
const SESSION_REQUEST_QUERY = `${MODULE_ID}.session-request`;
const SESSION_DELIVERY_QUERY = `${MODULE_ID}.session-delivery`;
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_SESSION_TTL_MS = 15 * 60 * 1000;
let singleton = null;

/**
 * Market Forge inter-client transport.
 *
 * Economic checkout uses Foundry V14 targeted User#query RPC. Because the
 * public query callback receives query data but no documented caller identity,
 * Market Forge first provisions a short-lived, GM-issued per-user capability
 * token through a second targeted query back to that user's own client. The GM
 * then derives requester identity from that token instead of trusting a user id
 * inside the checkout payload.
 *
 * The raw package socket remains only for fire-and-forget broadcasts such as
 * profile changes.
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
  #sessionTtlMs;
  #idFactory;
  #now;
  #clientSession = null;
  #authoritySessions = new Map();

  constructor({
    socketProvider = () => globalThis.game?.socket ?? null,
    usersProvider = () => globalThis.game?.users ?? null,
    currentUserProvider = () => globalThis.game?.user ?? null,
    configProvider = () => globalThis.CONFIG ?? null,
    authoritativeService = null,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    sessionTtlMs = DEFAULT_SESSION_TTL_MS,
    idFactory = () => createRuntimeId(32),
    now = () => Date.now()
  } = {}) {
    this.#socketProvider = socketProvider;
    this.#usersProvider = usersProvider;
    this.#currentUserProvider = currentUserProvider;
    this.#configProvider = configProvider;
    this.#service = authoritativeService ?? new AuthoritativeMarketService();
    this.#timeoutMs = Math.max(1000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS);
    this.#sessionTtlMs = Math.max(10000, Number(sessionTtlMs) || DEFAULT_SESSION_TTL_MS);
    this.#idFactory = idFactory;
    this.#now = now;
  }

  /** Register targeted Foundry User queries. Call during init on every client. */
  registerQueries() {
    if (this.#queryRegistered) return true;
    const config = this.#configProvider();
    if (!config?.queries || typeof config.queries !== "object") return false;
    config.queries[CHECKOUT_QUERY] = (queryData) => this.#handleCheckoutQuery(queryData);
    config.queries[SESSION_REQUEST_QUERY] = (queryData) => this.#handleSessionRequestQuery(queryData);
    config.queries[SESSION_DELIVERY_QUERY] = (queryData) => this.#handleSessionDeliveryQuery(queryData);
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

    return this.#requestPlayerCheckout(authority, request, { allowSessionRetry: true });
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

  getDiagnostics() {
    const user = this.#currentUserProvider();
    const authorityGmId = this.getAuthorityGmId();
    const session = this.#clientSession;
    return {
      queryRegistered: this.#queryRegistered,
      broadcastRegistered: this.#registered,
      authorityGmId,
      currentUserId: user?.id ?? null,
      currentUserIsAuthority: Boolean(user?.id && user.id === authorityGmId),
      hasClientAuthoritySession: Boolean(
        session?.token &&
        session.authorityGmId === authorityGmId &&
        session.expiresAt > this.#now()
      ),
      authoritySessionCount: user?.id === authorityGmId ? this.#validAuthoritySessionCount() : null
    };
  }

  async #requestPlayerCheckout(authority, request, { allowSessionRetry }) {
    const token = await this.#ensureAuthoritySession(authority);
    if (!token) return failure(request?.direction, "authority-session-unavailable");

    let result;
    try {
      result = toWireResult(await authority.query(CHECKOUT_QUERY, {
        sessionToken: token,
        request: jsonClone(request)
      }, { timeout: this.#timeoutMs }), request?.direction);
    } catch (error) {
      const code = looksLikeTimeout(error) ? "authority-timeout" : "authority-error";
      return failure(request?.direction, code, error);
    }

    if (allowSessionRetry && result.errors.includes("authority-session-invalid")) {
      this.#clientSession = null;
      return this.#requestPlayerCheckout(authority, request, { allowSessionRetry: false });
    }
    return result;
  }

  async #ensureAuthoritySession(authority) {
    const user = this.#currentUserProvider();
    if (!user?.id || !authority?.id) return null;

    const current = this.#clientSession;
    if (
      current?.token &&
      current.authorityGmId === authority.id &&
      current.expiresAt > this.#now() + 1000
    ) {
      return current.token;
    }

    this.#clientSession = null;
    const requestId = this.#idFactory();
    try {
      const response = await authority.query(SESSION_REQUEST_QUERY, {
        requesterUserId: user.id,
        requestId
      }, { timeout: this.#timeoutMs });
      if (response?.status !== "delivered" || response?.requestId !== requestId) return null;
    } catch (_error) {
      return null;
    }

    const delivered = this.#clientSession;
    if (
      !delivered?.token ||
      delivered.requestId !== requestId ||
      delivered.authorityGmId !== authority.id ||
      delivered.expiresAt <= this.#now()
    ) {
      return null;
    }
    return delivered.token;
  }

  async #handleSessionRequestQuery(queryData) {
    const gm = this.#currentUserProvider();
    const authorityGmId = this.getAuthorityGmId();
    if (!gm?.id || !gm.isGM || gm.id !== authorityGmId) {
      return { status: "failed", error: "authority-unavailable" };
    }

    const requesterUserId = String(queryData?.requesterUserId ?? "");
    const requestId = String(queryData?.requestId ?? "");
    const requester = getCollectionEntry(this.#usersProvider(), requesterUserId);
    if (!requestId || !requester?.id || requester.active === false || typeof requester.query !== "function") {
      return { status: "failed", error: "requester-unavailable" };
    }

    this.#pruneAuthoritySessions();
    this.#revokeAuthoritySessionsForUser(requester.id);
    const token = this.#idFactory();
    const expiresAt = this.#now() + this.#sessionTtlMs;
    this.#authoritySessions.set(token, { userId: requester.id, expiresAt });

    try {
      const receipt = await requester.query(SESSION_DELIVERY_QUERY, {
        requestId,
        targetUserId: requester.id,
        authorityGmId: gm.id,
        token,
        expiresAt
      }, { timeout: this.#timeoutMs });
      if (receipt?.received !== true || receipt?.requestId !== requestId) {
        this.#authoritySessions.delete(token);
        return { status: "failed", error: "session-delivery-failed" };
      }
    } catch (_error) {
      this.#authoritySessions.delete(token);
      return { status: "failed", error: "session-delivery-failed" };
    }

    // Deliberately do not return the token to the caller. It was delivered only
    // to the claimed User document via a separate targeted query.
    return { status: "delivered", requestId, expiresAt };
  }

  #handleSessionDeliveryQuery(queryData) {
    const user = this.#currentUserProvider();
    const authorityGmId = this.getAuthorityGmId();
    const targetUserId = String(queryData?.targetUserId ?? "");
    const requestId = String(queryData?.requestId ?? "");
    const token = String(queryData?.token ?? "");
    const expiresAt = Number(queryData?.expiresAt ?? 0);
    const claimedAuthority = String(queryData?.authorityGmId ?? "");

    if (
      !user?.id ||
      targetUserId !== user.id ||
      !requestId ||
      !token ||
      claimedAuthority !== authorityGmId ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= this.#now()
    ) {
      return { received: false, requestId };
    }

    this.#clientSession = {
      requestId,
      token,
      authorityGmId: claimedAuthority,
      expiresAt
    };
    return { received: true, requestId };
  }

  async #handleCheckoutQuery(queryData) {
    const user = this.#currentUserProvider();
    const authorityGmId = this.getAuthorityGmId();
    const direction = queryData?.request?.direction;

    if (!user?.id || !user.isGM || user.id !== authorityGmId) {
      return failure(direction, "authority-unavailable");
    }

    const session = this.#resolveAuthoritySession(queryData?.sessionToken);
    if (!session) return failure(direction, "authority-session-invalid");

    const requester = getCollectionEntry(this.#usersProvider(), session.userId);
    if (!requester || requester.active === false) {
      return failure(direction, "requester-unavailable");
    }

    try {
      const result = await this.#service.checkout(queryData?.request, { requesterUserId: requester.id });
      return toWireResult(result, direction);
    } catch (error) {
      console.error?.(`${MODULE_ID} | Authoritative checkout query failed`, error);
      return failure(direction, "authority-error", error);
    }
  }

  #resolveAuthoritySession(token) {
    this.#pruneAuthoritySessions();
    if (typeof token !== "string" || !token) return null;
    const entry = this.#authoritySessions.get(token);
    return entry && entry.expiresAt > this.#now() ? entry : null;
  }

  #revokeAuthoritySessionsForUser(userId) {
    for (const [token, entry] of this.#authoritySessions) {
      if (entry?.userId === userId) this.#authoritySessions.delete(token);
    }
  }

  #pruneAuthoritySessions() {
    const now = this.#now();
    for (const [token, entry] of this.#authoritySessions) {
      if (!entry || entry.expiresAt <= now) this.#authoritySessions.delete(token);
    }
  }

  #validAuthoritySessionCount() {
    this.#pruneAuthoritySessions();
    return this.#authoritySessions.size;
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

export { CHECKOUT_QUERY, SESSION_DELIVERY_QUERY, SESSION_REQUEST_QUERY };

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
