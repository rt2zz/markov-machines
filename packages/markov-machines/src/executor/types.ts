import type { Charter } from "../types/charter.js";
import type { Instance } from "../types/instance.js";
import type { Message } from "../types/messages.js";

/**
 * Options for executor run.
 */
export interface RunOptions {
  maxTurns?: number;
}

/**
 * Result returned from executor run.
 */
export interface RunResult {
  /** Text response from the agent */
  response: string;
  /** Updated instance tree */
  instance: Instance;
  /** New messages from this turn */
  messages: Message[];
  /** Why the run stopped */
  stopReason: "end_turn" | "max_tokens" | "yield";
  /** Payload from yield (only set when stopReason is "yield") */
  yieldPayload?: unknown;
  /** Updated pack states (to be applied to root instance) */
  packStates?: Record<string, unknown>;
}

/**
 * Executor interface for running the agent loop.
 * Charter has a single executor that runs all nodes.
 */
export interface Executor {
  /** Executor type identifier */
  type: "standard";

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
    instance: Instance,
    ancestors: Instance[],
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
  maxTokens?: number;
}
