import { v4 as uuid } from "uuid";
import type { Node, NodeConfig, OutputConfig } from "../types/node.js";

/**
 * Create a new node instance without structured output.
 * @typeParam S - The node's state type.
 */
export function createNode<S>(config: NodeConfig<S>): Node<S, never>;

/**
 * Create a new node instance with structured output.
 * @typeParam S - The node's state type.
 * @typeParam M - The output message type.
 */
export function createNode<S, M>(
  config: NodeConfig<S, M> & { output: OutputConfig<M> },
): Node<S, M>;

/**
 * Create a new node instance.
 * Node has no knowledge of Charter - it only knows about its own state type S.
 *
 * @typeParam S - The node's state type.
 * @typeParam M - The output message type (never = no structured output).
 */
export function createNode<S, M = never>(
  config: NodeConfig<S, M>,
): Node<S, M> {
  const {
    instructions,
    tools = {},
    validator,
    transitions = {},
    commands,
    initialState,
    packs,
    executorConfig,
    output,
  } = config;

  // Validate tool names match their keys
  for (const [key, tool] of Object.entries(tools)) {
    if (tool.name !== key) {
      throw new Error(
        `Node tool name mismatch: key "${key}" does not match tool.name "${tool.name}"`,
      );
    }
  }

  // Validate command names match their keys
  if (commands) {
    for (const [key, command] of Object.entries(commands)) {
      if (command.name !== key) {
        throw new Error(
          `Node command name mismatch: key "${key}" does not match command.name "${command.name}"`,
        );
      }
    }
  }

  return {
    id: uuid(),
    instructions,
    tools,
    validator,
    transitions,
    commands,
    initialState,
    packs,
    executorConfig,
    output,
  };
}
