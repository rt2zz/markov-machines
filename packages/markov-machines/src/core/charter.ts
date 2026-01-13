import type { Charter, CharterConfig } from "../types/charter.js";

/**
 * Create a new charter instance.
 * A charter is a static registry of executors, tools, transitions, and nodes.
 * It has no state - state lives in NodeInstances.
 */
export function createCharter(config: CharterConfig): Charter {
  const {
    name,
    executors = {},
    tools = {},
    transitions = {},
    nodes = {},
    config: modelConfig,
  } = config;

  // Validate tool names match keys
  for (const [key, tool] of Object.entries(tools)) {
    if (tool.name !== key) {
      throw new Error(
        `Charter tool name mismatch: key "${key}" does not match tool.name "${tool.name}"`,
      );
    }
  }

  // Validate executor types
  for (const [key, executor] of Object.entries(executors)) {
    if (!executor.type) {
      throw new Error(
        `Executor "${key}" is missing type property`,
      );
    }
  }

  return {
    name,
    executors,
    tools,
    transitions,
    nodes,
    config: modelConfig,
  };
}
