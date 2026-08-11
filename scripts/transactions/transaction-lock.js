export class TransactionLock {
  #keys = new Set();

  isLocked(key) {
    return this.#keys.has(String(key));
  }

  async run(key, operation) {
    key = String(key);
    if (this.#keys.has(key)) {
      const error = new Error("PF2E Market Forge: A transaction for this actor is already running.");
      error.code = "transaction-locked";
      throw error;
    }

    this.#keys.add(key);
    try {
      return await operation();
    } finally {
      this.#keys.delete(key);
    }
  }
}

export const globalTransactionLock = new TransactionLock();

export function transactionLockKey({ itemActorUuid, currencyActorUuid }) {
  return [...new Set([itemActorUuid, currencyActorUuid].filter(Boolean))].sort().join("|");
}
