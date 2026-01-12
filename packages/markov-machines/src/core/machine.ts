import type { Charter } from "../types/charter.js";
import type { Node } from "../types/node.js";
import type { Machine, MachineConfig } from "../types/machine.js";

/**
 * Create a new machine instance.
 * Validates the initial state against the node's validator.
 */
export function createMachine<R, S>(
  charter: Charter<R>,
  node: Node<S>,
  config: MachineConfig<R, S>,
): Machine<R, S> {
  const { state, rootState, history = [] } = config;

  // Validate initial node state
  const nodeStateResult = node.validator.safeParse(state);
  if (!nodeStateResult.success) {
    throw new Error(`Invalid initial state: ${nodeStateResult.error.message}`);
  }

  // Use provided rootState or charter's initialRootState
  const resolvedRootState = rootState ?? charter.initialRootState;

  // Validate root state
  const rootStateResult = charter.rootValidator.safeParse(resolvedRootState);
  if (!rootStateResult.success) {
    throw new Error(`Invalid root state: ${rootStateResult.error.message}`);
  }

  return {
    charter,
    node,
    state: nodeStateResult.data,
    rootState: rootStateResult.data,
    history,
  };
}
