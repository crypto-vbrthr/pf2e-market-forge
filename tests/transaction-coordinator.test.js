import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TransactionCoordinator } from "../scripts/transactions/transaction-coordinator.js";

describe("Cross-client transaction coordinator", () => {
  it("serializes operations for the same actor key", async () => {
    const coordinator = new TransactionCoordinator();
    const order = [];
    let releaseFirst;
    const blocker = new Promise((resolve) => { releaseFirst = resolve; });

    const first = coordinator.run("Actor.party", async () => { order.push("first-start"); await blocker; order.push("first-end"); });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const second = coordinator.run("Actor.party", async () => { order.push("second-start"); order.push("second-end"); });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(order, ["first-start"]);
    releaseFirst();
    await Promise.all([first, second]);
    assert.deepEqual(order, ["first-start", "first-end", "second-start", "second-end"]);
  });

  it("serializes transactions that overlap on either inventory or currency actor", async () => {
    const coordinator = new TransactionCoordinator();
    const order = [];
    let releaseFirst;
    const blocker = new Promise((resolve) => { releaseFirst = resolve; });

    const first = coordinator.run(["Actor.character", "Actor.party"], async () => {
      order.push("first-start");
      await blocker;
      order.push("first-end");
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const second = coordinator.run(["Actor.party", "Actor.vendor"], async () => {
      order.push("second-start");
      order.push("second-end");
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepEqual(order, ["first-start"]);
    releaseFirst();
    await Promise.all([first, second]);
    assert.deepEqual(order, ["first-start", "first-end", "second-start", "second-end"]);
  });

  it("allows unrelated actor keys to proceed independently", async () => {
    const coordinator = new TransactionCoordinator();
    const order = [];
    await Promise.all([
      coordinator.run("Actor.a", async () => { order.push("a"); }),
      coordinator.run("Actor.b", async () => { order.push("b"); })
    ]);
    assert.deepEqual(new Set(order), new Set(["a", "b"]));
  });
});
