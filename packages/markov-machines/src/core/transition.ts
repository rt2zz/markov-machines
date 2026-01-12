import type { z } from "zod";
import type { Node } from "../types/node.js";
import type {
  CodeTransition,
  TransitionContext,
  TransitionResult,
} from "../types/transitions.js";

/**
 * Configuration for creating a transition.
 */
export interface TransitionConfig<R, S> {
  description: string;
  /** Optional custom arguments schema */
  arguments?: z.ZodType;
  /**
   * Execute function that returns the target node and optionally the new state.
   * Use transitionTo() helper for type-safe returns.
   */
  execute: (
    state: S,
    ctx: TransitionContext<R>,
  ) => Promise<TransitionResult<R>> | TransitionResult<R>;
}

/**
 * Create a new code transition with explicit type parameters.
 */
export function createTransition<R, S = unknown>(
  config: TransitionConfig<R, S>,
): CodeTransition<R, S>;

/**
 * Create a new code transition with source state type inferred from a node.
 * The node parameter is only used for type inference.
 */
export function createTransition<R, S>(
  from: Node<R, S>,
  config: TransitionConfig<R, S>,
): CodeTransition<R, S>;

/**
 * Create a new code transition.
 *
 * @example
 * // With explicit types
 * const toCheckout = createTransition<RootState, CartState>({
 *   description: "Proceed to checkout",
 *   execute: (state, ctx) => transitionTo(checkoutNode, {
 *     items: state.cart,
 *   }),
 * });
 *
 * @example
 * // With type inference from source node
 * const toCheckout = createTransition(cartNode, {
 *   description: "Proceed to checkout",
 *   execute: (state, ctx) => transitionTo(checkoutNode, {
 *     items: state.cart, // state is inferred as CartState
 *   }),
 * });
 */
export function createTransition<R, S>(
  configOrFrom: TransitionConfig<R, S> | Node<R, S>,
  maybeConfig?: TransitionConfig<R, S>,
): CodeTransition<R, S> {
  // Overload resolution: if second arg exists, first arg is the node
  const config = maybeConfig ?? (configOrFrom as TransitionConfig<R, S>);

  return {
    description: config.description,
    arguments: config.arguments,
    execute: config.execute,
  };
}
