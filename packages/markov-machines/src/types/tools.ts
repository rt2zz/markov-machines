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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyToolDefinition<S = unknown> = ToolDefinition<any, any, S>;

/**
 * Anthropic tool definition format for API calls.
 */
export type AnthropicToolDefinition = Tool;

// Legacy aliases for backwards compatibility
export type ToolDefinitionLegacy<TInput, TOutput, S> = ToolDefinition<TInput, TOutput, S>;
export type CharterToolContext<R = unknown> = ToolContext<R>;
export type NodeToolContext<S = unknown> = ToolContext<S>;
export type CharterToolDefinition<TInput = unknown, TOutput = unknown, R = unknown> = ToolDefinition<TInput, TOutput, R>;
export type NodeToolDefinition<TInput = unknown, TOutput = unknown, S = unknown> = ToolDefinition<TInput, TOutput, S>;
export type AnyCharterToolDefinition<R = unknown> = AnyToolDefinition<R>;
export type AnyNodeToolDefinition<S = unknown> = AnyToolDefinition<S>;
