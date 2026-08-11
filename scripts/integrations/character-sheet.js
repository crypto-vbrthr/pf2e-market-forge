import { injectMarketButton } from "./sheet-integration-helpers.js";

export function registerCharacterSheetIntegration() {
  Hooks.on("renderActorSheetPF2e", (app, html) => injectMarketButton(app, html, "character"));
}
