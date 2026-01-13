import type { Charter } from "../types/charter.js";
import type { NodeInstance } from "../types/instance.js";
import type { Message } from "../types/messages.js";
import type { Ref } from "../types/refs.js";
import type { Node } from "../types/node.js";

/**
 * Options for executor run.
 */
export interface RunOptions {
  maxTurns?: number;
  signal?: AbortSignal;
}

/**
 * Result returned from executor run.
 */
export interface RunResult {
  /** Text response from the agent (empty for vessel) */
  response: string;
  /** Updated instance tree */
  instance: NodeInstance;
  /** New messages from this turn */
  messages: Message[];
  /** Why the run stopped */
  stopReason: "end_turn" | "max_tokens" | "delegated";
}

/**
 * Executor interface for running the agent loop.
 * Each node has an executor ref that determines how it runs.
 */
export interface Executor {
  /** Executor type identifier */
  type: "standard" | "vessel";

  /**
   * Run the executor for a node instance.
   * @param charter - The charter (for ref resolution)
   * @param instance - The current node instance (may have ancestors)
   * @param ancestors - Parent instances for ref resolution (from root to parent)
   * @param input - User input message
   * @param options - Run options
   */
  run(
    charter: Charter,
    instance: NodeInstance,
    ancestors: NodeInstance[],
    input: string,
    options?: RunOptions,
  ): Promise<RunResult>;
}

/**
 * Configuration for StandardExecutor.
 */
export interface StandardExecutorConfig {
  apiKey?: string;
  model?: string;
}

/**
 * Configuration for VesselExecutor.
 */
export interface VesselExecutorConfig {
  /** Which child node to instantiate */
  childNode: Ref | Node<unknown>;
  /** Initial state for child, or derive from parent state */
  childInitialState?: unknown | ((parentState: unknown) => unknown);
}
