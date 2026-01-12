import type { z } from "zod";
import type { Ref, SerialNode, SerialTransition } from "./refs.js";
import type { Node } from "./node.js";

/**
 * Context passed to code transition execute functions.
 */
export interface TransitionContext<R = unknown> {
  /** Arguments passed by the agent when calling the transition */
  args: unknown;
  /** Reason provided by the agent for the transition */
  reason: string;
  /** Root state (persists across transitions) */
  rootState: R;
}

/**
 * Result of executing a code transition.
 * Returns the target node and optionally the new state.
 * R is the root state type, T is the target node's state type.
 */
export interface TransitionResult<R = unknown, T = unknown> {
  /** The target node to transition to */
  node: Node<R, T>;
  /**
   * The new state for the target node.
   * If undefined, the node's default initial state will be used.
   */
  state?: T;
}

/**
 * Code-defined transition (not serializable).
 * Executes custom logic to determine the target node and state.
 * R is the root state type, S is the source node's state type.
 */
export interface CodeTransition<R = unknown, S = unknown> {
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
    ctx: TransitionContext<R>,
  ) => Promise<TransitionResult<R>> | TransitionResult<R>;
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
 * - CodeTransition: Custom code-defined transition
 * - SerialTransition: Serializable transition referencing a node
 * - GeneralTransition: Agent can create nodes dynamically
 * - Ref: Reference to a transition in the charter registry
 */
export type Transition<R = unknown, S = unknown> =
  | CodeTransition<R, S>
  | SerialTransition
  | GeneralTransition
  | Ref;

/**
 * Helper to create a type-safe transition result.
 * Ensures the state matches the target node's state type.
 */
export function transitionTo<R, T>(
  node: Node<R, T>,
  state?: T,
): TransitionResult<R, T> {
  return { node, state };
}

/**
 * Type guard for CodeTransition
 */
export function isCodeTransition<R, S>(
  value: unknown,
): value is CodeTransition<R, S> {
  return (
    typeof value === "object" &&
    value !== null &&
    "description" in value &&
    "execute" in value &&
    typeof (value as CodeTransition<R, S>).execute === "function"
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
export function transitionHasArguments<R, S>(
  transition: Transition<R, S>,
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
