import type { z } from "zod";
import type { Ref } from "./refs.js";
import type { Transition } from "./transitions.js";
import type { AnyToolDefinition } from "./tools.js";

/**
 * Node configuration for createNode.
 * S is the node's state type.
 */
export interface NodeConfig<S = unknown> {
  /** Reference to executor in charter.executors */
  executor: Ref;
  instructions: string;
  /** Node tools (state access via context) */
  tools?: Record<string, AnyToolDefinition<S>>;
  validator: z.ZodType<S>;
  /** Transitions see node state S */
  transitions?: Record<string, Transition<S>>;
  /** Optional initial state for this node */
  initialState?: S;
}

/**
 * Runtime node instance.
 * S is the node's state type. Node has no knowledge of Charter.
 */
export interface Node<S = unknown> {
  /** Unique identifier for this node instance */
  id: string;
  /** Reference to executor in charter.executors */
  executor: Ref;
  /** Instructions for the agent in this node */
  instructions: string;
  /** Node tools (state access via context) */
  tools: Record<string, AnyToolDefinition<S>>;
  /** Zod schema for validating state */
  validator: z.ZodType<S>;
  /** Available transitions from this node (see node state S) */
  transitions: Record<string, Transition<S>>;
  /** Optional initial state for this node */
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
    "executor" in value &&
    "instructions" in value &&
    "tools" in value &&
    "validator" in value &&
    "transitions" in value
  );
}
