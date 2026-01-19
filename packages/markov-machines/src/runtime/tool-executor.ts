import type { AnyToolDefinition, ToolContext } from "../types/tools.js";
import { isToolReply } from "../types/tools.js";

/**
 * Result of executing a tool.
 */
export interface ToolExecutionResult {
  result: string;
  isError: boolean;
  /** Message for the user - string or typed M (type erased to unknown at runtime) */
  userMessage?: unknown;
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

    // Handle ToolReply - extract separate user and LLM messages
    if (isToolReply(output)) {
      return {
        result: output.llmMessage,
        isError: false,
        userMessage: output.userMessage,
      };
    }

    // Convert output to string
    const resultStr =
      typeof output === "string" ? output : JSON.stringify(output);

    return { result: resultStr, isError: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { result: `Tool execution error: ${message}`, isError: true };
  }
}