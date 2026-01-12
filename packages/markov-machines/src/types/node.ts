import type { z } from "zod";
import type { Transition } from "./transitions.js";
import type { AnyNodeToolDefinition } from "./tools.js";

/**
 * Node configuration for createNode.
 * S is the node's state type.
 */
export interface NodeConfig<S = unknown> {
  instructions: string;
  /** Inline node tools (node state access) */
  tools?: Record<string, AnyNodeToolDefinition<S>>;
  validator: z.ZodType<S>;
  /** Transitions see node state S */
  transitions: Record<string, Transition<S>>;
  /** Optional initial state for this node, used when transitioning with state: undefined */
  initialState?: S;
}

/**
 * Runtime node instance.
 * S is the node's state type. Node has no knowledge of Charter or root state.
 */
export interface Node<S = unknown> {
  /** Unique identifier for this node instance */
  id: string;
  /** Instructions for the agent in this node */
  instructions: string;
  /** Inline node tools (node state access) */
  tools: Record<string, AnyNodeToolDefinition<S>>;
  /** Zod schema for validating state */
  validator: z.ZodType<S>;
  /** Available transitions from this node (see node state S) */
  transitions: Record<string, Transition<S>>;
  /** Optional initial state for this node, used when transitioning with state: undefined */
  initialState?: S;
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
