import type { z } from "zod";
import type { Transition } from "./transitions.js";
import type { AnyToolDefinition, AnthropicBuiltinTool } from "./tools.js";
import type { AnyCommandDefinition } from "./commands.js";
import type { Pack } from "./pack.js";

/**
 * Tool entry - either a regular tool definition or an Anthropic builtin tool.
 */
export type NodeToolEntry<S = unknown> = AnyToolDefinition<S> | AnthropicBuiltinTool;

/**
 * Node configuration for createNode.
 * @typeParam S - The node's state type.
 */
export interface NodeConfig<S = unknown> {
  instructions: string;
  /** Node tools (state access via context) */
  tools?: Record<string, NodeToolEntry<S>>;
  validator: z.ZodType<S>;
  /** Transitions see node state S */
  transitions?: Record<string, Transition<S>>;
  /** Commands - user-callable methods that bypass LLM inference */
  commands?: Record<string, AnyCommandDefinition<S>>;
  /** Optional initial state for this node */
  initialState?: S;
  /** Packs this node uses */
  // Packs have their own state types independent of node state, requiring `any`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  packs?: Pack<any>[];
  /** Per-node executor configuration (overrides executor defaults) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  executorConfig?: Record<string, any>;
}

/**
 * Runtime node instance.
 * @typeParam S - The node's state type. Node has no knowledge of Charter.
 */
export interface Node<S = unknown> {
  /** Unique identifier for this node instance */
  id: string;
  /** Instructions for the agent in this node */
  instructions: string;
  /** Node tools (state access via context) */
  tools: Record<string, NodeToolEntry<S>>;
  /** Zod schema for validating state */
  validator: z.ZodType<S>;
  /** Available transitions from this node (see node state S) */
  transitions: Record<string, Transition<S>>;
  /** Commands - user-callable methods that bypass LLM inference */
  commands?: Record<string, AnyCommandDefinition<S>>;
  /** Optional initial state for this node */
  initialState?: S;
  /** Packs this node uses */
  // Packs have their own state types independent of node state, requiring `any`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  packs?: Pack<any>[];
  /** Per-node executor configuration (overrides executor defaults) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  executorConfig?: Record<string, any>;
}

/**
 * Check if a value is a Node instance.
 */
export function isNode<S>(value: unknown): value is Node<S> {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "instructions" in value &&
    "tools" in value &&
    "validator" in value &&
    "transitions" in value
  );
}
