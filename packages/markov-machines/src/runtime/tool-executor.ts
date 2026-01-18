import type { AnyToolDefinition, ToolContext } from "../types/tools.js";

/**
 * Result of executing a tool.
 */
export interface ToolExecutionResult {
  result: string;
  isError: boolean;
}

/**
 * Execute a tool with the given input and state.
 */
export async function executeTool<S>(
  tool: AnyToolDefinition<S>,
  input: unknown,
  state: S,
  onStateUpdate: (patch: Partial<S>) => void,
): Promise<ToolExecutionResult> {
  try {
    // Validate input
    const inputResult = tool.inputSchema.safeParse(input);
    if (!inputResult.success) {
      return {
        result: `Invalid tool input: ${inputResult.error.message}`,
        isError: true,
      };
    }

    // Create context
    const ctx: ToolContext<S> = {
      state,
      updateState: onStateUpdate,
    };

    // Execute tool
    const output = await tool.execute(inputResult.data, ctx);

    // Convert output to string
    const resultStr =
      typeof output === "string" ? output : JSON.stringify(output);

    return { result: resultStr, isError: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { result: `Tool execution error: ${message}`, isError: true };
  }
}

// thinking either ctx.reply(contentBlock)
// or add a new union to ToolExecutionResult, Array<ToolReply,ToolResult> which can be used to split into two categories in the ecxecutor