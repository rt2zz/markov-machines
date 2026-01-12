import type { Charter } from "../types/charter.js";
import type { Machine, SerializedMachine } from "../types/machine.js";
import type { Node } from "../types/node.js";
import type { Ref, SerialNode } from "../types/refs.js";
import { isRef } from "../types/refs.js";
import { deserializeNode, resolveNodeRef } from "../runtime/transition-executor.js";

/**
 * Deserialize a machine from persisted state.
 * The charter must be the same (or compatible) as when serialized.
 */
export function deserializeMachine<R, S>(
  charter: Charter<R>,
  serialized: SerializedMachine<R, S>,
): Machine<R, S> {
  // Resolve node
  const node = resolveNodeRef(charter, serialized.node);

  // Validate node state against the node's validator
  const nodeStateResult = node.validator.safeParse(serialized.state);
  if (!nodeStateResult.success) {
    throw new Error(`Invalid state: ${nodeStateResult.error.message}`);
  }

  // Validate root state against the charter's rootValidator
  const rootStateResult = charter.rootValidator.safeParse(serialized.rootState);
  if (!rootStateResult.success) {
    throw new Error(`Invalid root state: ${rootStateResult.error.message}`);
  }

  return {
    charter,
    node,
    state: nodeStateResult.data,
    rootState: rootStateResult.data,
    history: serialized.history,
  };
}

/**
 * Re-export deserializeNode for convenience.
 */
export { deserializeNode };
