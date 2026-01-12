import type { Machine } from "../types/machine.js";
import type { RunOptions, RunResult } from "../types/charter.js";

/**
 * Run the machine with user input.
 * Delegates to the charter's executor.
 */
export async function runMachine<R, S>(
  machine: Machine<R, S>,
  input: string,
  options?: RunOptions,
): Promise<RunResult<R, S>> {
  return machine.charter.executor.run(machine, input, options);
}
