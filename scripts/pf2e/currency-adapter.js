export class CurrencyAdapter {
  async getBalance() { return notImplemented("getBalance"); }
  async canAfford() { return notImplemented("canAfford"); }
  async remove() { return notImplemented("remove"); }
  async add() { return notImplemented("add"); }
}

function notImplemented(method) {
  throw new Error(`PF2E Market Forge: CurrencyAdapter.${method} is not implemented.`);
}
