import { v4 as uuid } from "uuid";
import type { Node, NodeConfig } from "../types/node.js";

/**
 * Create a new node instance.
 * Node has no knowledge of Charter - it only knows about its own state type S.
 */
export function createNode<S>(config: NodeConfig<S>): Node<S> {
  const {
    instructions,
    tools = {},
    validator,
    transitions = {},
    initialState,
    packs,
  } = config;

  // Validate tool names match their keys
  for (const [key, tool] of Object.entries(tools)) {
    if (tool.name !== key) {
      throw new Error(
        `Node tool name mismatch: key "${key}" does not match tool.name "${tool.name}"`,
      );
    }
  }

  return {
    id: uuid(),
    instructions,
    tools,
    validator,
    transitions,
    initialState,
    packs,
  };
}
