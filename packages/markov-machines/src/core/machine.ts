import type { Charter } from "../types/charter.js";
import type { Machine, MachineConfig } from "../types/machine.js";
import type { NodeInstance } from "../types/instance.js";

/**
 * Validate a node instance tree recursively.
 * Ensures all states are valid according to their node validators.
 */
function validateInstance(instance: NodeInstance): void {
  // Validate this instance's state
  const stateResult = instance.node.validator.safeParse(instance.state);
  if (!stateResult.success) {
    throw new Error(
      `Invalid state for node "${instance.node.id}": ${stateResult.error.message}`,
    );
  }

  // Recursively validate child
  if (instance.child) {
    validateInstance(instance.child);
  }
}

/**
 * Create a new machine instance.
 * Validates all states in the instance tree.
 */
export function createMachine(
  charter: Charter,
  config: MachineConfig,
): Machine {
  const { instance, history = [] } = config;

  // Validate the entire instance tree
  validateInstance(instance);

  // Verify all executor refs exist in charter
  verifyExecutorRefs(charter, instance);

  return {
    charter,
    instance,
    history,
  };
}

/**
 * Verify all executor refs in the instance tree exist in the charter.
 */
function verifyExecutorRefs(charter: Charter, instance: NodeInstance): void {
  const executorRef = instance.node.executor.ref;
  if (!charter.executors[executorRef]) {
    throw new Error(
      `Unknown executor ref "${executorRef}" in node "${instance.node.id}". ` +
        `Available executors: ${Object.keys(charter.executors).join(", ") || "none"}`,
    );
  }

  if (instance.child) {
    verifyExecutorRefs(charter, instance.child);
  }
}
