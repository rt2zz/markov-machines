import type { Charter } from "../types/charter.js";
import type { Instance } from "../types/instance.js";
import type { Message } from "../types/messages.js";

/**
 * Options for executor run.
 */
export interface RunOptions {
  maxTurns?: number;
  /** Previous conversation history to include */
  history?: Message[];
  /** Max execution steps (for cede continuation). Default 50. */
  maxSteps?: number;
  /** Current step number (1-indexed) */
  currentStep?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Result returned from executor run (single API call).
 */
export interface RunResult {
  /** Text response from the agent */
  response: string;
  /** Updated instance tree */
  instance: Instance;
  /** New messages from this turn */
  messages: Message[];
  /** Why the run stopped */
  stopReason: "end_turn" | "tool_use" | "max_tokens" | "cede";
  /** Payload from cede (only set when stopReason is "cede") */
  cedePayload?: unknown;
  /** Updated pack states (to be applied to root instance) */
  packStates?: Record<string, unknown>;
}

/**
 * A single step in machine execution.
 * Each step represents exactly one Claude API call.
 */
export interface MachineStep {
  /** Updated instance tree after this step */
  instance: Instance;
  /** Messages generated in this step */
  messages: Message[];
  /** Why this step ended */
  stopReason: "end_turn" | "tool_use" | "cede" | "max_tokens";
  /** Text response if any (may be partial/status) */
  response: string;
  /** True if this is the final step (has response or hit limit) */
  done: boolean;
  /** Cede payload if stopReason is "cede" */
  cedePayload?: unknown;
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
  /** Enable debug logging for API requests/responses */
  debug?: boolean;
}
