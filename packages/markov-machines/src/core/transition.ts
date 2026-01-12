import type { z } from "zod";
import type { Node } from "../types/node.js";
import type {
  CodeTransition,
  TransitionContext,
  TransitionResult,
} from "../types/transitions.js";

/**
 * Configuration for creating a transition.
 * S is the source state type (root state for charter transitions, node state for node transitions).
 */
export interface TransitionConfig<S> {
  description: string;
  /** Optional custom arguments schema */
  arguments?: z.ZodType;
  /**
   * Execute function that returns the target node and optionally the new state.
   * Use transitionTo() helper for type-safe returns.
   */
  execute: (
    state: S,
    ctx: TransitionContext,
  ) => Promise<TransitionResult> | TransitionResult;
}

/**
 * Create a new code transition with explicit type parameter.
 */
export function createTransition<S = unknown>(
  config: TransitionConfig<S>,
): CodeTransition<S>;

/**
 * Create a new code transition with source state type inferred from a node.
 * The node parameter is only used for type inference.
 */
export function createTransition<S>(
  from: Node<S>,
  config: TransitionConfig<S>,
): CodeTransition<S>;

/**
 * Create a new code transition.
 * S is the source state type - root state for charter transitions, node state for node transitions.
 *
 * @example
 * // With explicit types (for charter transition)
 * const toCheckout = createTransition<RootState>({
 *   description: "Proceed to checkout",
 *   execute: (rootState, ctx) => transitionTo(checkoutNode, {
 *     items: rootState.cart,
 *   }),
 * });
 *
 * @example
 * // With type inference from source node (for node transition)
 * const toCheckout = createTransition(cartNode, {
 *   description: "Proceed to checkout",
 *   execute: (state, ctx) => transitionTo(checkoutNode, {
 *     items: state.cart, // state is inferred as CartState
 *   }),
 * });
 */
export function createTransition<S>(
  configOrFrom: TransitionConfig<S> | Node<S>,
  maybeConfig?: TransitionConfig<S>,
): CodeTransition<S> {
  // Overload resolution: if second arg exists, first arg is the node
  const config = maybeConfig ?? (configOrFrom as TransitionConfig<S>);

  return {
    description: config.description,
    arguments: config.arguments,
    execute: config.execute,
  };
}
