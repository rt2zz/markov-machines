import { z } from "zod";
import type { Charter, CharterConfig } from "../types/charter.js";

// Default empty root state validator
const defaultRootValidator = z.object({}).passthrough();

/**
 * Create a new charter instance.
 * A charter is the registry of tools, transitions, and nodes.
 */
export function createCharter<R = Record<string, never>>(
  config: CharterConfig<R>,
): Charter<R> {
  const {
    name,
    executor,
    tools = {},
    transitions = {},
    nodes = {},
    config: modelConfig,
    rootValidator,
    initialRootState,
  } = config;

  // Validate charter tool names match keys
  for (const [key, tool] of Object.entries(tools)) {
    if (tool.name !== key) {
      throw new Error(
        `Charter tool name mismatch: key "${key}" does not match tool.name "${tool.name}"`,
      );
    }
  }

  // Use provided rootValidator or default to empty object
  const resolvedRootValidator = (rootValidator ??
    defaultRootValidator) as z.ZodType<R>;
  const resolvedInitialRootState = (initialRootState ?? {}) as R;

  // Validate initial root state
  const rootParseResult = resolvedRootValidator.safeParse(
    resolvedInitialRootState,
  );
  if (!rootParseResult.success) {
    throw new Error(
      `Invalid initial root state: ${rootParseResult.error.message}`,
    );
  }

  return {
    name,
    executor,
    tools,
    transitions,
    nodes,
    config: modelConfig,
    rootValidator: resolvedRootValidator,
    initialRootState: rootParseResult.data,
  };
}
