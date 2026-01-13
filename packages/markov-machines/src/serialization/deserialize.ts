import type { Charter } from "../types/charter.js";
import type { Machine, SerializedMachine, SerializedInstance } from "../types/machine.js";
import type { NodeInstance } from "../types/instance.js";
import { isRef } from "../types/refs.js";
import { deserializeNode, resolveNodeRef } from "../runtime/transition-executor.js";

/**
 * Deserialize a node instance from persisted state.
 */
export function deserializeInstance(
  charter: Charter,
  serialized: SerializedInstance,
): NodeInstance {
  // Resolve node
  const node = resolveNodeRef(charter, serialized.node);

  // Validate state against the node's validator
  const stateResult = node.validator.safeParse(serialized.state);
  if (!stateResult.success) {
    throw new Error(`Invalid state: ${stateResult.error.message}`);
  }

  // Recursively deserialize child
  const child = serialized.child
    ? deserializeInstance(charter, serialized.child)
    : undefined;

  return {
    node,
    state: stateResult.data,
    child,
  };
}

/**
 * Deserialize a machine from persisted state.
 * The charter must be the same (or compatible) as when serialized.
 */
export function deserializeMachine(
  charter: Charter,
  serialized: SerializedMachine,
): Machine {
  return {
    charter,
    instance: deserializeInstance(charter, serialized.instance),
    history: serialized.history,
  };
}

/**
 * Re-export deserializeNode for convenience.
 */
export { deserializeNode };
