/**
 * Cross-request transaction coordinator.
 *
 * A transaction can touch two actors (item inventory and currency). Queue each actor
 * independently so transactions with any overlapping actor are serialized, while
 * unrelated actor sets can still proceed in parallel.
 */
export class TransactionCoordinator {
  #tails = new Map();

  async run(keys, operation) {
    const normalizedKeys = normalizeKeys(keys);
    if (typeof operation !== "function") throw new TypeError("Transaction coordinator requires an operation.");
    if (normalizedKeys.length === 0) throw new TypeError("Transaction coordinator requires at least one lock key.");

    const previous = [...new Set(normalizedKeys.map((key) => this.#tails.get(key)).filter(Boolean))];
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    for (const key of normalizedKeys) this.#tails.set(key, gate);

    try {
      await Promise.all(previous.map((tail) => tail.catch(() => undefined)));
      return await operation();
    } finally {
      release();
      for (const key of normalizedKeys) {
        if (this.#tails.get(key) === gate) this.#tails.delete(key);
      }
    }
  }

  hasPending(keys) {
    return normalizeKeys(keys).some((key) => this.#tails.has(key));
  }
}

export const globalTransactionCoordinator = new TransactionCoordinator();

function normalizeKeys(keys) {
  const values = Array.isArray(keys) ? keys : [keys];
  return [...new Set(values.filter(Boolean).map((key) => String(key)))].sort();
}
