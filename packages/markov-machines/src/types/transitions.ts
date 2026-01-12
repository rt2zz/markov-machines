import type { z } from "zod";
import type { Ref, SerialNode, SerialTransition } from "./refs.js";
import type { Node } from "./node.js";

/**
 * Context passed to code transition execute functions.
 * Symmetric at both charter and node levels.
 */
export interface TransitionContext {
  /** Arguments passed by the agent when calling the transition */
  args: unknown;
  /** Reason provided by the agent for the transition */
  reason: string;
}

/**
 * Result of executing a code transition.
 * Returns the target node and optionally the new state.
 * T is the target node's state type.
 */
export interface TransitionResult<T = unknown> {
  /** The target node to transition to */
  node: Node<T>;
  /**
   * The new state for the target node.
   * If undefined, the node's default initial state will be used.
   */
  state?: T;
}

/**
 * Code-defined transition (not serializable).
 * Executes custom logic to determine the target node and state.
 * S is the source state type (root state for charter transitions, node state for node transitions).
 */
export interface CodeTransition<S = unknown> {
  description: string;
  /** Optional custom arguments schema */
  arguments?: z.ZodType;
  /**
   * Execute function that returns the target node and optionally the new state.
   * If state is undefined, the target node's default initial state will be used.
   * Use transitionTo() helper for type-safe returns.
   */
  execute: (
    state: S,
    ctx: TransitionContext,
  ) => Promise<TransitionResult> | TransitionResult;
}

/**
 * General transition - agent can create nodes dynamically.
 * The arguments implicitly include a `node` property for inline node definitions.
 */
export interface GeneralTransition {
  type: "general";
  description: string;
}

/**
 * Union of all transition types.
 * S is the source state type.
 * - CodeTransition: Custom code-defined transition
 * - SerialTransition: Serializable transition referencing a node
 * - GeneralTransition: Agent can create nodes dynamically
 * - Ref: Reference to a transition in the charter registry
 */
export type Transition<S = unknown> =
  | CodeTransition<S>
  | SerialTransition
  | GeneralTransition
  | Ref;

/**
 * Helper to create a type-safe transition result.
 * Ensures the state matches the target node's state type.
 */
export function transitionTo<T>(
  node: Node<T>,
  state?: T,
): TransitionResult<T> {
  return { node, state };
}

/**
 * Type guard for CodeTransition
 */
export function isCodeTransition<S>(
  value: unknown,
): value is CodeTransition<S> {
  return (
    typeof value === "object" &&
    value !== null &&
    "description" in value &&
    "execute" in value &&
    typeof (value as CodeTransition<S>).execute === "function"
  );
}

/**
 * Type guard for GeneralTransition
 */
export function isGeneralTransition(value: unknown): value is GeneralTransition {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    (value as GeneralTransition).type === "general"
  );
}

/**
 * Check if a transition has custom arguments (requires named tool).
 */
export function transitionHasArguments<S>(
  transition: Transition<S>,
): boolean {
  if (isCodeTransition(transition)) {
    return transition.arguments !== undefined;
  }
  if (isGeneralTransition(transition)) {
    return true; // General transitions always have node argument
  }
  if ("arguments" in transition && transition.arguments !== undefined) {
    return true;
  }
  return false;
}
