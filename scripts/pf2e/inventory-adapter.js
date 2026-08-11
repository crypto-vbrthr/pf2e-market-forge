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
    const item = await this.#itemProvider(sourceUuid);
    if (!item) throw new RangeError(`Item not found: ${sourceUuid}`);
    const source = itemSource(item);
    return this.addSource(actorUuid, source, quantity, { sourceUuid });
  }

  /** Add an already-authoritatively generated physical item source (for example a scroll or wand). */
  async addSource(actorUuid, sourceData, quantity = 1, { sourceUuid = null } = {}) {
    assertQuantity(quantity);
    const actor = await this.#requireActor(actorUuid);
    const source = structuredClone(sourceData);
    if (!source || typeof source !== "object" || !isPhysicalSource(source)) {
      throw new TypeError("Item source is not a supported physical PF2e item.");
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
    if (!resultItem?.id) throw new Error("PF2E Market Forge: PF2e did not return an added item.");

    const identity = sourceUuid ?? `generated:${source.type}:${source.name ?? resultItem.id}`;
    return existing
      ? { type: "stack-update", actorUuid, itemId: resultItem.id, sourceUuid: identity, addedQuantity: quantity, previousQuantity }
      : { type: "create", actorUuid, itemId: resultItem.id, sourceUuid: identity, addedQuantity: quantity };
  }


  /**
   * Remove a concrete embedded item quantity and return enough information to restore it exactly.
   * This never accepts compendium items: itemUuid must belong to actorUuid.
   */
  async removeOwnedItem(actorUuid, itemUuid, quantity = 1) {
    assertQuantity(quantity);
    const actor = await this.#requireActor(actorUuid);
    const item = await this.#resolveOwnedItem(actor, itemUuid);
    if (!item) {
      const error = new RangeError(`Owned item not found: ${itemUuid}`);
      error.code = "item-not-found";
      throw error;
    }

    const previousQuantity = Number(item.quantity ?? item.system?.quantity ?? 0);
    if (!Number.isSafeInteger(previousQuantity) || previousQuantity < quantity) {
      const error = new RangeError(`Insufficient quantity for ${itemUuid}.`);
      error.code = "insufficient-quantity";
      throw error;
    }

    if (quantity < previousQuantity) {
      if (typeof actor.updateEmbeddedDocuments !== "function") {
        throw new Error("PF2E Market Forge: Actor cannot update embedded Items during sale.");
      }
      await actor.updateEmbeddedDocuments("Item", [{
        _id: item.id,
        "system.quantity": previousQuantity - quantity
      }], { render: false });
      return {
        type: "quantity-remove",
        actorUuid,
        itemId: item.id,
        itemUuid,
        removedQuantity: quantity,
        previousQuantity
      };
    }

    if (typeof actor.deleteEmbeddedDocuments !== "function") {
      throw new Error("PF2E Market Forge: Actor cannot delete embedded Items during sale.");
    }
    const source = itemSource(item);
    await actor.deleteEmbeddedDocuments("Item", [item.id], { render: false });
    return {
      type: "delete",
      actorUuid,
      itemId: item.id,
      itemUuid,
      removedQuantity: quantity,
      previousQuantity,
      source
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

    if (mutation.type === "stack-update" || mutation.type === "quantity-remove") {
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

    if (mutation.type === "delete") {
      if (!mutation.source || typeof mutation.source !== "object") {
        throw new TypeError("Rollback delete mutation has no item source snapshot.");
      }
      if (typeof actor.createEmbeddedDocuments !== "function") {
        throw new Error("PF2E Market Forge: Actor cannot restore embedded Items during rollback.");
      }
      await actor.createEmbeddedDocuments("Item", [structuredClone(mutation.source)], {
        keepId: true,
        render: false
      });
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

  async #resolveOwnedItem(actor, itemUuid) {
    const resolved = await this.#itemProvider(itemUuid);
    if (resolved && (resolved.actor?.uuid ?? resolved.parent?.uuid) === actor.uuid) return resolved;

    const itemId = String(itemUuid ?? "").split(".Item.").at(-1);
    if (!itemId || itemId === itemUuid) return null;
    return actor.inventory?.get?.(itemId) ?? actor.items?.get?.(itemId) ?? null;
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
