import type { Charter } from "../types/charter.js";
import type { Node } from "../types/node.js";
import type { CharterToolContext, NodeToolContext } from "../types/tools.js";

/**
 * Execute a charter tool (root state access only).
 */
export async function executeCharterTool<R>(
  charter: Charter<R>,
  toolName: string,
  input: unknown,
  rootState: R,
  onRootStateUpdate: (patch: Partial<R>) => void,
): Promise<{ result: string; isError: boolean }> {
  const tool = charter.tools[toolName];

  if (!tool) {
    return {
      result: `Unknown charter tool: ${toolName}`,
      isError: true,
    };
  }

  // Validate input
  const parseResult = tool.inputSchema.safeParse(input);
  if (!parseResult.success) {
    return {
      result: `Invalid input for tool ${toolName}: ${parseResult.error.message}`,
      isError: true,
    };
  }

  // Create charter tool context (root state only)
  const ctx: CharterToolContext<R> = {
    rootState,
    updateRootState: onRootStateUpdate,
  };

  try {
    const result = await tool.execute(parseResult.data, ctx);
    return {
      result: typeof result === "string" ? result : JSON.stringify(result),
      isError: false,
    };
  } catch (error) {
    return {
      result: error instanceof Error ? error.message : String(error),
      isError: true,
    };
  }
}

/**
 * Execute a node tool (node state access only).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function executeNodeTool<S>(
  node: Node<any, S>,
  toolName: string,
  input: unknown,
  state: S,
  onStateUpdate: (patch: Partial<S>) => void,
): Promise<{ result: string; isError: boolean }> {
  const tool = node.tools[toolName];

  if (!tool) {
    return {
      result: `Unknown node tool: ${toolName}`,
      isError: true,
    };
  }

  // Validate input
  const parseResult = tool.inputSchema.safeParse(input);
  if (!parseResult.success) {
    return {
      result: `Invalid input for tool ${toolName}: ${parseResult.error.message}`,
      isError: true,
    };
  }

  // Create node tool context (node state only)
  const ctx: NodeToolContext<S> = {
    state,
    updateState: onStateUpdate,
  };

  try {
    const result = await tool.execute(parseResult.data, ctx);
    return {
      result: typeof result === "string" ? result : JSON.stringify(result),
      isError: false,
    };
  } catch (error) {
    return {
      result: error instanceof Error ? error.message : String(error),
      isError: true,
    };
  }
}
