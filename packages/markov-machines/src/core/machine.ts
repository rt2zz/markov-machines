import { v4 as uuid } from "uuid";
import type { Charter } from "../types/charter.js";
import type { Machine, MachineConfig } from "../types/machine.js";
import type { Instance } from "../types/instance.js";

/**
 * Validate a node instance tree recursively.
 * Ensures all states are valid according to their node validators.
 * Also ensures all instances have IDs.
 */
function validateInstance(instance: Instance): void {
  // Ensure instance has ID
  if (!instance.id) {
    (instance as { id: string }).id = uuid();
  }

  // Validate this instance's state
  const stateResult = instance.node.validator.safeParse(instance.state);
  if (!stateResult.success) {
    throw new Error(
      `Invalid state for node "${instance.node.id}": ${stateResult.error.message}`,
    );
  }

  // Recursively validate children
  if (instance.child) {
    const children = Array.isArray(instance.child)
      ? instance.child
      : [instance.child];
    for (const child of children) {
      validateInstance(child);
    }
  }
}

/**
 * Initialize pack states for all packs in the charter.
 * Uses initialState from each pack if defined.
 */
function initializePackStates(charter: Charter): Record<string, unknown> {
  const packStates: Record<string, unknown> = {};
  for (const pack of charter.packs) {
    packStates[pack.name] = pack.initialState;
  }
  return packStates;
}

/**
 * Create a new machine instance.
 * Validates all states in the instance tree.
 * Initializes pack states on root instance if not present.
 */
export function createMachine(charter: Charter, config: MachineConfig): Machine {
  const { instance, history = [] } = config;

  // Initialize pack states on root instance if not present
  if (!instance.packStates && charter.packs.length > 0) {
    instance.packStates = initializePackStates(charter);
  }

  // Validate the entire instance tree
  validateInstance(instance);

  return {
    charter,
    instance,
    history,
  };
}
