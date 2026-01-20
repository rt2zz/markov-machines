import type { Node } from "../types/node.js";
import type {
  CedeResult,
  SpawnResult,
  SpawnTarget,
  SpawnOptions,
} from "../types/transitions.js";
import type { Message } from "../types/messages.js";

/**
 * Cede control back to parent with optional content.
 * The current instance is REMOVED from the tree.
 *
 * @param content - Optional string message or array of Messages to pass to parent
 * @returns CedeResult to return from transition execute
 *
 * @example
 * // Cede with no content
 * const done = createTransition({
 *   description: "Complete",
 *   execute: () => cede(),
 * });
 *
 * @example
 * // Cede with a string message
 * const complete = createTransition({
 *   description: "Complete with message",
 *   execute: (state) => cede(`Found ${state.results.length} results`),
 * });
 *
 * @example
 * // Cede with structured messages
 * const completeWithData = createTransition({
 *   description: "Complete with data",
 *   execute: (state) => cede([
 *     userMessage(`Research complete: ${state.query}`),
 *   ]),
 * });
 */
export function cede<M = unknown>(
  content?: string | Message<M>[],
): CedeResult<M> {
  return { type: "cede", content };
}

/**
 * Spawn one or more child instances.
 * Children are added to the current node's children array.
 * Supports both standard and passive nodes.
 *
 * @param nodeOrTargets - Single node or array of SpawnTargets
 * @param state - Initial state (only used when first arg is a node)
 * @param options - Spawn options (executorConfig, etc.)
 * @returns SpawnResult to return from transition execute
 *
 * @example
 * // Spawn a single child
 * const spawnWorker = createTransition({
 *   description: "Spawn a worker",
 *   execute: (state) => spawn(workerNode, { taskId: "123" }),
 * });
 *
 * @example
 * // Spawn multiple children
 * const spawnWorkers = createTransition({
 *   description: "Spawn multiple workers",
 *   execute: (state) => spawn([
 *     { node: workerNode, state: { taskId: "1" } },
 *     { node: workerNode, state: { taskId: "2" } },
 *   ]),
 * });
 */
export function spawn<T = unknown>(
  nodeOrTargets: Node<T> | SpawnTarget<T>[],
  state?: T,
  options?: SpawnOptions,
): SpawnResult<T> {
  const children: SpawnTarget<T>[] = Array.isArray(nodeOrTargets)
    ? nodeOrTargets
    : [{ node: nodeOrTargets, state, executorConfig: options?.executorConfig }];
  return {
    type: "spawn",
    children,
  };
}
