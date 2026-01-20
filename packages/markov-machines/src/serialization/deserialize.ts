import type { Charter } from "../types/charter.js";
import type {
  Machine,
  SerializedMachine,
  SerializedInstance,
} from "../types/machine.js";
import type { Instance } from "../types/instance.js";
import { resolveNodeRef } from "../runtime/transition-executor.js";
export { deserializeNode } from "../runtime/transition-executor.js";

/**
 * Deserialize a node instance from persisted state.
 */
export function deserializeInstance(
  charter: Charter,
  serialized: SerializedInstance,
): Instance {
  // Resolve node
  const node = resolveNodeRef(charter, serialized.node);

  // Validate state against the node's validator
  const stateResult = node.validator.safeParse(serialized.state);
  if (!stateResult.success) {
    throw new Error(`Invalid state: ${stateResult.error.message}`);
  }

  // Recursively deserialize children
  let child: Instance | Instance[] | undefined;
  if (serialized.child) {
    if (Array.isArray(serialized.child)) {
      child = serialized.child.map((c) => deserializeInstance(charter, c));
    } else {
      child = deserializeInstance(charter, serialized.child);
    }
  }

  return {
    id: serialized.id,
    node,
    state: stateResult.data,
    child,
    ...(serialized.packStates ? { packStates: serialized.packStates } : {}),
    ...(serialized.suspended ? {
      suspended: {
        suspendId: serialized.suspended.suspendId,
        reason: serialized.suspended.reason,
        suspendedAt: new Date(serialized.suspended.suspendedAt),
        metadata: serialized.suspended.metadata,
      }
    } : {}),
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
