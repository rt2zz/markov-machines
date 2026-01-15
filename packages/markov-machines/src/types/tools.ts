import type { z } from "zod";
import type { Tool } from "@anthropic-ai/sdk/resources/messages";

/**
 * Context passed to tool execute functions.
 * S is the state type - could be node state or ancestor state depending on where the tool is defined.
 */
export interface ToolContext<S = unknown> {
  /** Current state */
  state: S;
  /** Update state with a partial patch */
  updateState: (patch: Partial<S>) => void;
}

/**
 * Tool definition.
 * S is the state type this tool operates on.
 */
export interface ToolDefinition<
  TInput = unknown,
  TOutput = unknown,
  S = unknown,
> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  execute: (
    input: TInput,
    ctx: ToolContext<S>,
  ) => Promise<TOutput> | TOutput;
}

/**
 * Base tool definition type for storage.
 * Uses 'any' for input/output to allow heterogeneous tool collections.
 */
// Heterogeneous collections cannot preserve specific input/output types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyToolDefinition<S = unknown> = ToolDefinition<any, any, S>;

/**
 * Anthropic tool definition format for API calls.
 */
export type AnthropicToolDefinition = Tool;

/**
 * Anthropic built-in tool (server-side, no execute function).
 * Used for tools like web_search that Anthropic handles.
 */
export interface AnthropicBuiltinTool {
  type: "anthropic-builtin";
  name: string;
  /** The Anthropic tool type, e.g., "web_search_20250305" */
  builtinType: string;
}

/**
 * Type guard for AnthropicBuiltinTool.
 */
export function isAnthropicBuiltinTool(tool: unknown): tool is AnthropicBuiltinTool {
  return (
    typeof tool === "object" &&
    tool !== null &&
    "type" in tool &&
    (tool as AnthropicBuiltinTool).type === "anthropic-builtin"
  );
}

