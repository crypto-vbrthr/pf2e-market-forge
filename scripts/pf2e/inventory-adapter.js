export class InventoryAdapter {
  async getInventory() { return notImplemented("getInventory"); }
  async getItem() { return notImplemented("getItem"); }
  async addItem() { return notImplemented("addItem"); }
  async removeItem() { return notImplemented("removeItem"); }
  async getSnapshot() { return notImplemented("getSnapshot"); }
  async restoreSnapshot() { return notImplemented("restoreSnapshot"); }
}

function notImplemented(method) {
  throw new Error(`PF2E Market Forge: InventoryAdapter.${method} is not implemented.`);
}
