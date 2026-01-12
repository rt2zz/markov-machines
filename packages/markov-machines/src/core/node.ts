import { v4 as uuid } from "uuid";
import type { Charter } from "../types/charter.js";
import type { Node, NodeConfig } from "../types/node.js";
import { isRef } from "../types/refs.js";

/**
 * Create a new node instance.
 * Validates that all charter tool refs exist in the charter.
 */
export function createNode<R, S>(
  charter: Charter<R>,
  config: NodeConfig<R, S>,
): Node<R, S> {
  const {
    instructions,
    charterTools = [],
    tools = {},
    validator,
    transitions,
    initialState,
  } = config;

  // Validate charter tool refs exist in charter
  for (const toolRef of charterTools) {
    if (!charter.tools[toolRef.ref]) {
      throw new Error(
        `Unknown charter tool ref "${toolRef.ref}" in node. ` +
          `Available charter tools: ${Object.keys(charter.tools).join(", ") || "none"}`,
      );
    }
  }

  // Validate inline node tool names match their keys
  for (const [key, tool] of Object.entries(tools)) {
    if (tool.name !== key) {
      throw new Error(
        `Node tool name mismatch: key "${key}" does not match tool.name "${tool.name}"`,
      );
    }
  }

  // Validate transition refs exist in charter
  for (const [name, transition] of Object.entries(transitions)) {
    if (isRef(transition)) {
      if (!charter.transitions[transition.ref]) {
        throw new Error(
          `Unknown transition ref "${transition.ref}" in node. ` +
            `Available transitions: ${Object.keys(charter.transitions).join(", ") || "none"}`,
        );
      }
    }
  }

  return {
    id: uuid(),
    instructions,
    charterTools,
    tools,
    validator,
    transitions,
    initialState,
  };
}
