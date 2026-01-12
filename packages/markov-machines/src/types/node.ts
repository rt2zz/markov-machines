import type { z } from "zod";
import type { Ref } from "./refs.js";
import type { Transition } from "./transitions.js";
import type { AnyNodeToolDefinition } from "./tools.js";

/**
 * Node configuration for createNode.
 */
export interface NodeConfig<R = unknown, S = unknown> {
  instructions: string;
  /** References to charter tools (root state access) */
  charterTools?: Ref[];
  /** Inline node tools (node state access) */
  tools?: Record<string, AnyNodeToolDefinition<S>>;
  validator: z.ZodType<S>;
  transitions: Record<string, Transition<R, S>>;
  /** Optional initial state for this node, used when transitioning with state: undefined */
  initialState?: S;
}

/**
 * Runtime node instance.
 * Contains the node configuration plus resolved references.
 */
export interface Node<R = unknown, S = unknown> {
  /** Unique identifier for this node instance */
  id: string;
  /** Instructions for the agent in this node */
  instructions: string;
  /** References to charter tools (root state access) */
  charterTools: Ref[];
  /** Inline node tools (node state access) */
  tools: Record<string, AnyNodeToolDefinition<S>>;
  /** Zod schema for validating state */
  validator: z.ZodType<S>;
  /** Available transitions from this node */
  transitions: Record<string, Transition<R, S>>;
  /** Optional initial state for this node, used when transitioning with state: undefined */
  initialState?: S;
}

/**
 * Check if a value is a Node instance.
 */
export function isNode<R, S>(value: unknown): value is Node<R, S> {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "instructions" in value &&
    "charterTools" in value &&
    "tools" in value &&
    "validator" in value &&
    "transitions" in value
  );
}
