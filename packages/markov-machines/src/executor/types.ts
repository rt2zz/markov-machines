import type { Machine } from "../types/machine.js";
import type { RunOptions, RunResult } from "../types/charter.js";

/**
 * Executor interface for running the agent loop.
 */
export interface Executor {
  run<R, S>(
    machine: Machine<R, S>,
    input: string,
    options?: RunOptions,
  ): Promise<RunResult<R, S>>;
}

/**
 * Configuration for StandardExecutor.
 */
export interface StandardExecutorConfig {
  apiKey?: string;
  model?: string;
}
