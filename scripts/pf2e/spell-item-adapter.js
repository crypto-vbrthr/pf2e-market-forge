export class SpellItemAdapter {
  async createScrollSource() { return notImplemented("createScrollSource"); }
  async createWandSource() { return notImplemented("createWandSource"); }
}

function notImplemented(method) {
  throw new Error(`PF2E Market Forge: SpellItemAdapter.${method} is not implemented.`);
}
