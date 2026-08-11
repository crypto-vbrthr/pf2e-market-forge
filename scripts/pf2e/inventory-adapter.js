export class InventoryAdapter {
  #actorProvider;
  #itemProvider;

  constructor({ actorProvider, itemProvider } = {}) {
    this.#actorProvider = actorProvider ?? defaultActorProvider;
    this.#itemProvider = itemProvider ?? defaultItemProvider;
  }

  async getInventory(actorUuid) {
    const actor = await this.#requireActor(actorUuid);
    return Array.from(actor?.inventory?.contents ?? actor?.inventory ?? []);
  }

  async getItem(itemUuid) {
    return this.#itemProvider(itemUuid);
  }

  /**
   * Add a compendium/world physical item to an actor and return an exact compensation record.
   * PF2e's ActorInventory.add() performs the actual stacking decision.
   */
  async addFromUuid(actorUuid, sourceUuid, quantity = 1) {
    assertQuantity(quantity);
    const actor = await this.#requireActor(actorUuid);
    const item = await this.#itemProvider(sourceUuid);
    if (!item) throw new RangeError(`Item not found: ${sourceUuid}`);

    const source = itemSource(item);
    if (!source || typeof source !== "object" || !isPhysicalSource(source)) {
      throw new TypeError(`Item is not a supported physical PF2e item: ${sourceUuid}`);
    }

    source.system ??= {};
    source.system.quantity = quantity;
    delete source._id;

    const inventory = actor.inventory;
    if (!inventory || typeof inventory.add !== "function") {
      throw new Error("PF2E Market Forge: Actor inventory does not expose add().");
    }

    const existing = typeof inventory.findStackableItem === "function"
      ? inventory.findStackableItem(source)
      : null;
    const previousQuantity = existing ? Number(existing.quantity ?? existing.system?.quantity ?? 0) : null;

    const result = await inventory.add(source, { stack: true, render: false });
    const resultItem = Array.isArray(result) ? result[0] : null;
    if (!resultItem?.id) throw new Error(`PF2E Market Forge: PF2e did not return an added item for ${sourceUuid}.`);

    return existing
      ? {
          type: "stack-update",
          actorUuid,
          itemId: resultItem.id,
          sourceUuid,
          addedQuantity: quantity,
          previousQuantity
        }
      : {
          type: "create",
          actorUuid,
          itemId: resultItem.id,
          sourceUuid,
          addedQuantity: quantity
        };
  }

  async rollbackMutation(mutation) {
    if (!mutation || typeof mutation !== "object") throw new TypeError("Inventory mutation is required.");
    const actor = await this.#requireActor(mutation.actorUuid);

    if (mutation.type === "create") {
      if (typeof actor.deleteEmbeddedDocuments !== "function") {
        throw new Error("PF2E Market Forge: Actor cannot delete embedded Items during rollback.");
      }
      await actor.deleteEmbeddedDocuments("Item", [mutation.itemId], { render: false });
      return;
    }

    if (mutation.type === "stack-update") {
      if (!Number.isSafeInteger(mutation.previousQuantity) || mutation.previousQuantity < 0) {
        throw new TypeError("Rollback mutation has no valid previous quantity.");
      }
      if (typeof actor.updateEmbeddedDocuments !== "function") {
        throw new Error("PF2E Market Forge: Actor cannot update embedded Items during rollback.");
      }
      await actor.updateEmbeddedDocuments("Item", [{
        _id: mutation.itemId,
        "system.quantity": mutation.previousQuantity
      }], { render: false });
      return;
    }

    throw new TypeError(`Unsupported inventory mutation type: ${mutation.type}`);
  }

  async refresh(actorUuid) {
    const actor = await this.#requireActor(actorUuid);
    try {
      actor.sheet?.render?.(false);
    } catch (_error) {
      // Rendering is best effort and never part of the economic transaction.
    }
  }

  async #requireActor(actorUuid) {
    const actor = await this.#actorProvider(actorUuid);
    if (!actor) throw new RangeError(`Actor not found: ${actorUuid}`);
    return actor;
  }
}

async function defaultActorProvider(actorUuid) {
  if (!actorUuid) return null;
  const actors = globalThis.game?.actors;
  const actorId = String(actorUuid).startsWith("Actor.") ? String(actorUuid).slice(6) : null;
  const actor = actorId ? actors?.get?.(actorId) : null;
  if (actor) return actor;
  return typeof globalThis.fromUuid === "function" ? globalThis.fromUuid(actorUuid) : null;
}

async function defaultItemProvider(itemUuid) {
  return typeof globalThis.fromUuid === "function" ? globalThis.fromUuid(itemUuid) : null;
}

function itemSource(item) {
  const source = typeof item?.toObject === "function" ? item.toObject() : item;
  return structuredClone(source);
}

function isPhysicalSource(source) {
  return ["ammo", "armor", "backpack", "book", "consumable", "equipment", "shield", "treasure", "weapon", "kit"].includes(source.type);
}

function assertQuantity(quantity) {
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new TypeError("Quantity must be a positive integer.");
  }
}
