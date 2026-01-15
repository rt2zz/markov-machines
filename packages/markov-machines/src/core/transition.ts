import type { z } from "zod";
import type { Node } from "../types/node.js";
import type {
  CodeTransition,
  TransitionContext,
  TransitionResult,
  TransitionHelpers,
  SpawnTarget,
  CedeResult,
  SpawnResult,
} from "../types/transitions.js";

/**
 * Create the transition helpers object.
 */
export function createHelpers(): TransitionHelpers {
  return {
    cede: <P = unknown>(payload?: P): CedeResult<P> => ({
      type: "cede",
      payload,
    }),
    spawn: <T = unknown>(
      nodeOrTargets: Node<T> | SpawnTarget<T>[],
      state?: T,
    ): SpawnResult<T> => {
      const children = Array.isArray(nodeOrTargets)
        ? nodeOrTargets
        : [{ node: nodeOrTargets, state }];
      return {
        type: "spawn",
        children,
      };
    },
  };
}

/**
 * Configuration for creating a transition.
 * S is the source state type.
 */
export interface TransitionConfig<S> {
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
 * S is the source state type.
 *
 * @example
 * // Normal transition
 * const toCheckout = createTransition({
 *   description: "Proceed to checkout",
 *   execute: (state, ctx, helpers) => transitionTo(checkoutNode, {
 *     items: state.cart,
 *   }),
 * });
 *
 * @example
 * // Spawn children
 * const spawnWorker = createTransition({
 *   description: "Spawn a worker",
 *   execute: (state, ctx, { spawn }) => spawn(workerNode, { taskId: "123" }),
 * });
 *
 * @example
 * // Cede to parent
 * const complete = createTransition({
 *   description: "Complete and cede",
 *   execute: (state, ctx, { cede }) => cede({ result: state.result }),
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
    execute: (state: S, ctx: TransitionContext, helpers: TransitionHelpers) => {
      // Use provided helpers or create default ones
      const h = helpers ?? createHelpers();
      return config.execute(state, ctx, h);
    },
  };
}
