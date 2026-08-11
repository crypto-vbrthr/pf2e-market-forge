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
    return this.#createReceipt({ plan, remainingBalance, direction: "buy" });
  }

  async createSaleReceipt({ plan, remainingBalance = null }) {
    return this.#createReceipt({ plan, remainingBalance, direction: "sell" });
  }

  async #createReceipt({ plan, remainingBalance, direction }) {
    const actor = await this.#actorProvider(plan.itemActorUuid);
    const requester = this.#userProvider(plan.requestedByUserId);
    const recipients = receiptRecipients(requester);
    const content = direction === "sell"
      ? renderSaleReceipt({ plan, actorName: actor?.name ?? plan.itemActorUuid, remainingBalance })
      : renderPurchaseReceipt({ plan, actorName: actor?.name ?? plan.itemActorUuid, remainingBalance });

    return this.#messageCreator({
      user: globalThis.game?.user?.id,
      speaker: globalThis.ChatMessage?.getSpeaker?.({ actor }) ?? {},
      whisper: recipients,
      content,
      flags: {
        [MODULE_ID]: {
          transactionId: plan.transactionId,
          direction,
          total: plan.total
        }
      }
    });
  }
}

export function renderPurchaseReceipt({ plan, actorName, remainingBalance = null }) {
  return renderReceipt({
    plan,
    actorName,
    remainingBalance,
    titleKey: "PF2E_MARKET_FORGE.Receipt.PurchaseTitle",
    titleFallback: "Market Forge · Einkauf",
    totalKey: "PF2E_MARKET_FORGE.Cart.Total",
    totalFallback: "Gesamt",
    balanceKey: "PF2E_MARKET_FORGE.Cart.Remaining",
    balanceFallback: "Verbleibend",
    icon: "fa-coins"
  });
}

export function renderSaleReceipt({ plan, actorName, remainingBalance = null }) {
  return renderReceipt({
    plan,
    actorName,
    remainingBalance,
    titleKey: "PF2E_MARKET_FORGE.Receipt.SaleTitle",
    titleFallback: "Market Forge · Verkauf",
    totalKey: "PF2E_MARKET_FORGE.Sell.TotalProceeds",
    totalFallback: "Erlös",
    balanceKey: "PF2E_MARKET_FORGE.Sell.BalanceAfter",
    balanceFallback: "Guthaben danach",
    icon: "fa-hand-holding-dollar"
  });
}

function renderReceipt({ plan, actorName, remainingBalance, titleKey, titleFallback, totalKey, totalFallback, balanceKey, balanceFallback, icon }) {
  const title = localize(titleKey, titleFallback);
  const totalLabel = formatCopper(plan.total);
  const remaining = Number.isSafeInteger(remainingBalance) && remainingBalance >= 0
    ? `<div class="market-forge-receipt-total"><span>${escapeHtml(localize(balanceKey, balanceFallback))}</span><strong>${escapeHtml(formatCopper(remainingBalance))}</strong></div>`
    : "";
  const lines = plan.lines.map((line) => {
    const name = line.resolvedProduct?.name ?? line.product?.name ?? "?";
    return `<li><span>${line.quantity} × ${escapeHtml(name)}</span><strong>${escapeHtml(formatCopper(line.price.totalPrice))}</strong></li>`;
  }).join("");

  return [
    `<section class="pf2e-market-forge-receipt">`,
    `<h3><i class="fa-solid ${icon}"></i> ${escapeHtml(title)}</h3>`,
    `<p>${escapeHtml(actorName)}</p>`,
    `<ul>${lines}</ul>`,
    `<div class="market-forge-receipt-total"><span>${escapeHtml(localize(totalKey, totalFallback))}</span><strong>${escapeHtml(totalLabel)}</strong></div>`,
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
