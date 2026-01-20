import { v4 as uuid } from "uuid";
import type {
  Node,
  NodeConfig,
  PassiveNode,
  PassiveNodeConfig,
  OutputConfig,
} from "../types/node.js";

/**
 * Validate tool and command names match their keys.
 */
function validateNames(
  tools: Record<string, { name: string }>,
  commands?: Record<string, { name: string }>,
): void {
  for (const [key, tool] of Object.entries(tools)) {
    if (tool.name !== key) {
      throw new Error(
        `Node tool name mismatch: key "${key}" does not match tool.name "${tool.name}"`,
      );
    }
  }

  if (commands) {
    for (const [key, command] of Object.entries(commands)) {
      if (command.name !== key) {
        throw new Error(
          `Node command name mismatch: key "${key}" does not match command.name "${command.name}"`,
        );
      }
    }
  }
}

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
export function createNode<S, M = never>(config: NodeConfig<S, M>): Node<S, M> {
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

  validateNames(tools, commands);

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

/**
 * Create a new passive node instance.
 * Passive nodes execute in parallel with the main flow but:
 * - Don't receive user input
 * - Can't access packs
 * - Must cede to return control (end_turn throws an error)
 *
 * @typeParam S - The node's state type.
 */
export function createPassiveNode<S>(config: PassiveNodeConfig<S>): PassiveNode<S, never>;

/**
 * Create a new passive node instance with structured output.
 * @typeParam S - The node's state type.
 * @typeParam M - The output message type.
 */
export function createPassiveNode<S, M>(
  config: PassiveNodeConfig<S, M> & { output: OutputConfig<M> },
): PassiveNode<S, M>;

/**
 * Create a new passive node instance.
 *
 * @typeParam S - The node's state type.
 * @typeParam M - The output message type (never = no structured output).
 */
export function createPassiveNode<S, M = never>(
  config: PassiveNodeConfig<S, M>,
): PassiveNode<S, M> {
  const {
    instructions,
    tools = {},
    validator,
    transitions = {},
    commands,
    initialState,
    executorConfig,
    output,
  } = config;

  validateNames(tools, commands);

  return {
    id: uuid(),
    instructions,
    tools,
    validator,
    transitions,
    commands,
    initialState,
    executorConfig,
    output,
    passive: true,
  };
}
