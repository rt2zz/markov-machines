import type { z } from "zod";
import type { Ref, SerialNode, SerialTransition } from "./refs.js";
import type { Node } from "./node.js";

/**
 * Context passed to code transition execute functions.
 */
export interface TransitionContext {
  /** Arguments passed by the agent when calling the transition */
  args: unknown;
  /** Reason provided by the agent for the transition */
  reason: string;
}

/**
 * Spawn target specification.
 */
export interface SpawnTarget<T = unknown> {
  node: Node<T>;
  state?: T;
}

/**
 * Normal transition - replace current instance with new node.
 */
export interface TransitionToResult<T = unknown> {
  type: "transition";
  node: Node<T>;
  state?: T;
}

/**
 * Spawn - add child instance(s) to current node.
 */
export interface SpawnResult<T = unknown> {
  type: "spawn";
  children: Array<SpawnTarget<T>>;
}

/**
 * Yield - return control to parent with optional payload.
 * The yielding instance is REMOVED from the tree.
 */
export interface YieldResult<P = unknown> {
  type: "yield";
  payload?: P;
}

/**
 * Union of all transition results.
 */
export type TransitionResult<T = unknown> =
  | TransitionToResult<T>
  | SpawnResult<T>
  | YieldResult;

/**
 * Helpers provided to transition execute functions.
 */
export interface TransitionHelpers {
  /**
   * Yield control back to parent with optional payload.
   * The current instance is REMOVED from the tree.
   */
  yield: <P = unknown>(payload?: P) => YieldResult<P>;

  /**
   * Spawn one or more child instances.
   * Children are added to the current node's children array.
   */
  spawn: <T = unknown>(
    nodeOrTargets: Node<T> | SpawnTarget<T>[],
    state?: T,
  ) => SpawnResult<T>;
}

/**
 * Code-defined transition (not serializable).
 * Executes custom logic to determine the target node and state.
 * S is the source state type.
 */
export interface CodeTransition<S = unknown> {
  description: string;
  /** Optional custom arguments schema */
  arguments?: z.ZodType;
  /**
   * Execute function with yield/spawn helpers.
   */
  execute: (
    state: S,
    ctx: TransitionContext,
    helpers: TransitionHelpers,
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
 */
export type Transition<S = unknown> =
  | CodeTransition<S>
  | SerialTransition
  | GeneralTransition
  | Ref;

/**
 * Helper to create a type-safe transition result.
 */
export function transitionTo<T>(
  node: Node<T>,
  state?: T,
): TransitionToResult<T> {
  return { type: "transition", node, state };
}

/**
 * Type guard for TransitionToResult
 */
export function isTransitionToResult(
  value: unknown,
): value is TransitionToResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    (value as TransitionToResult).type === "transition"
  );
}

/**
 * Type guard for SpawnResult
 */
export function isSpawnResult(value: unknown): value is SpawnResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    (value as SpawnResult).type === "spawn"
  );
}

/**
 * Type guard for YieldResult
 */
export function isYieldResult(value: unknown): value is YieldResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    (value as YieldResult).type === "yield"
  );
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
export function isGeneralTransition(
  value: unknown,
): value is GeneralTransition {
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
export function transitionHasArguments<S>(transition: Transition<S>): boolean {
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
