export class TransactionService {
  async prepare() {
    throw new Error("PF2E Market Forge: transaction preparation is not implemented yet.");
  }

  async validate() {
    throw new Error("PF2E Market Forge: authoritative transaction validation is not implemented yet.");
  }

  async execute() {
    throw new Error("PF2E Market Forge: transaction execution is not implemented yet.");
  }
}
