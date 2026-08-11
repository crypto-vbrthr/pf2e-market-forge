import { injectMarketButton } from "./sheet-integration-helpers.js";

export function registerPartySheetIntegration() {
  Hooks.on("renderActorSheetPF2e", (app, html) => injectMarketButton(app, html, "party"));
}
