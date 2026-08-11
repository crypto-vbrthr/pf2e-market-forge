import { MODULE_ID } from "../core/constants.js";
import { getSetting, SETTINGS } from "../settings/register-settings.js";

export function injectMarketButton(app, html, expectedActorType) {
  if (!getSetting(SETTINGS.SHOW_INVENTORY_BUTTON, true)) return;
  const actor = app?.actor;
  if (!actor || actor.type !== expectedActorType) return;
  if (!canUseActor(actor)) return;

  const root = getRootElement(html);
  const inventory = root?.querySelector?.('.tab[data-tab="inventory"]');
  const header = inventory?.querySelector?.("header.inventory-header");
  if (!header || header.querySelector(`[data-${MODULE_ID}-launch]`)) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "pf2e-market-forge-inventory-button";
  button.dataset[camelDataKey(`${MODULE_ID}-launch`)] = "true";
  button.innerHTML = `<i class="fa-solid fa-coins"></i><span>${escapeHtml(localize("PF2E_MARKET_FORGE.Open"))}</span>`;
  button.title = localize("PF2E_MARKET_FORGE.OpenHint");
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    game.modules.get(MODULE_ID)?.api?.open?.({ actorUuid: actor.uuid, initialMode: "browse" });
  });

  header.append(button);
}

export function canUseActor(actor) {
  if (!actor || !["character", "party"].includes(actor.type)) return false;
  return game.user.isGM || actor.canUserModify?.(game.user, "update") === true;
}

function getRootElement(html) {
  if (html instanceof HTMLElement) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  return null;
}

function localize(key) {
  return game.i18n.localize(key);
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

function camelDataKey(value) {
  return value.replace(/-([a-z])/g, (_m, letter) => letter.toUpperCase());
}
