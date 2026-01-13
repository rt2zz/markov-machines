import type { Machine } from "../types/machine.js";
import type { RunOptions, RunResult } from "../executor/types.js";
import { resolveExecutor } from "../runtime/ref-resolver.js";

/**
 * Run the machine with user input.
 * Resolves the executor from the root instance and delegates to it.
 */
export async function runMachine(
  machine: Machine,
  input: string,
  options?: RunOptions,
): Promise<RunResult> {
  // Get the executor for the root instance
  const executorRef = machine.instance.node.executor.ref;
  const executor = resolveExecutor(machine.charter, executorRef);

  if (!executor) {
    throw new Error(
      `Unknown executor ref "${executorRef}". ` +
        `Available executors: ${Object.keys(machine.charter.executors).join(", ") || "none"}`,
    );
  }

  // Run with empty ancestors (root has no ancestors)
  return executor.run(machine.charter, machine.instance, [], input, options);
}
