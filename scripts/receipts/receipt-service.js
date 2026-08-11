import { MODULE_ID } from "../core/constants.js";

export class ReceiptService {
  #messageCreator;
  #userProvider;
  #actorProvider;

  constructor({ messageCreator, userProvider, actorProvider } = {}) {
    this.#messageCreator = messageCreator ?? defaultMessageCreator;
    this.#userProvider = userProvider ?? ((id) => globalThis.game?.users?.get?.(id) ?? null);
    this.#actorProvider = actorProvider ?? defaultActorProvider;
  }

  async createPurchaseReceipt({ plan, remainingBalance = null }) {
    const actor = await this.#actorProvider(plan.itemActorUuid);
    const requester = this.#userProvider(plan.requestedByUserId);
    const recipients = receiptRecipients(requester);
    const content = renderPurchaseReceipt({ plan, actorName: actor?.name ?? plan.itemActorUuid, remainingBalance });

    return this.#messageCreator({
      user: globalThis.game?.user?.id,
      speaker: globalThis.ChatMessage?.getSpeaker?.({ actor }) ?? {},
      whisper: recipients,
      content,
      flags: {
        [MODULE_ID]: {
          transactionId: plan.transactionId,
          direction: "buy",
          total: plan.total
        }
      }
    });
  }
}

export function renderPurchaseReceipt({ plan, actorName, remainingBalance = null }) {
  const title = localize("PF2E_MARKET_FORGE.Receipt.PurchaseTitle", "Market Forge · Einkauf");
  const totalLabel = formatCopper(plan.total);
  const remaining = Number.isSafeInteger(remainingBalance) && remainingBalance >= 0
    ? `<div class="market-forge-receipt-total"><span>${escapeHtml(localize("PF2E_MARKET_FORGE.Cart.Remaining", "Verbleibend"))}</span><strong>${escapeHtml(formatCopper(remainingBalance))}</strong></div>`
    : "";
  const lines = plan.lines.map((line) => {
    const name = line.resolvedProduct?.name ?? line.product?.name ?? "?";
    return `<li><span>${line.quantity} × ${escapeHtml(name)}</span><strong>${escapeHtml(formatCopper(line.price.totalPrice))}</strong></li>`;
  }).join("");

  return [
    `<section class="pf2e-market-forge-receipt">`,
    `<h3><i class="fa-solid fa-coins"></i> ${escapeHtml(title)}</h3>`,
    `<p>${escapeHtml(actorName)}</p>`,
    `<ul>${lines}</ul>`,
    `<div class="market-forge-receipt-total"><span>${escapeHtml(localize("PF2E_MARKET_FORGE.Cart.Total", "Gesamt"))}</span><strong>${escapeHtml(totalLabel)}</strong></div>`,
    remaining,
    `</section>`
  ].join("");
}

function receiptRecipients(requester) {
  const users = Array.from(globalThis.game?.users ?? []);
  const ids = new Set(users.filter((user) => user.isGM).map((user) => user.id));
  if (requester?.id) ids.add(requester.id);
  return [...ids];
}

async function defaultActorProvider(actorUuid) {
  return typeof globalThis.fromUuid === "function" ? globalThis.fromUuid(actorUuid) : null;
}

async function defaultMessageCreator(data) {
  if (typeof globalThis.ChatMessage?.create !== "function") return null;
  return globalThis.ChatMessage.create(data);
}

function formatCopper(value) {
  let remainder = Math.max(0, Math.trunc(Number(value) || 0));
  const gp = Math.floor(remainder / 100);
  remainder %= 100;
  const sp = Math.floor(remainder / 10);
  const cp = remainder % 10;
  const parts = [[gp, "gp"], [sp, "sp"], [cp, "cp"]]
    .filter(([amount]) => amount > 0)
    .map(([amount, denomination]) => `${amount} ${localize(`PF2E_MARKET_FORGE.Coins.${denomination}`, denomination.toUpperCase())}`);
  return parts.join(" ") || `0 ${localize("PF2E_MARKET_FORGE.Coins.cp", "CP")}`;
}

function localize(key, fallback) {
  const value = globalThis.game?.i18n?.localize?.(key);
  return value && value !== key ? value : fallback;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
