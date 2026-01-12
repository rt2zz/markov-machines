import type { z } from "zod";
import type { Tool } from "@anthropic-ai/sdk/resources/messages";

/**
 * Context passed to charter tool execute functions.
 * Charter tools only have access to root state.
 */
export interface CharterToolContext<R = unknown> {
  /** Root state (persists across transitions) */
  rootState: R;
  /** Update root state with a partial patch */
  updateRootState: (patch: Partial<R>) => void;
}

/**
 * Context passed to node tool execute functions.
 * Node tools only have access to node state.
 */
export interface NodeToolContext<S = unknown> {
  /** Node state */
  state: S;
  /** Update node state with a partial patch */
  updateState: (patch: Partial<S>) => void;
}

/**
 * Charter tool definition - only has access to root state.
 * Defined on the charter and referenced by nodes via charterTools.
 */
export interface CharterToolDefinition<
  TInput = unknown,
  TOutput = unknown,
  R = unknown,
> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  execute: (
    input: TInput,
    ctx: CharterToolContext<R>,
  ) => Promise<TOutput> | TOutput;
}

/**
 * Node tool definition - only has access to node state.
 * Defined inline on nodes.
 */
export interface NodeToolDefinition<
  TInput = unknown,
  TOutput = unknown,
  S = unknown,
> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  execute: (
    input: TInput,
    ctx: NodeToolContext<S>,
  ) => Promise<TOutput> | TOutput;
}

/**
 * Base charter tool definition type for storage in charter.
 * Uses 'any' for input/output to allow heterogeneous tool collections.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyCharterToolDefinition<R = unknown> = CharterToolDefinition<
  any,
  any,
  R
>;

/**
 * Base node tool definition type for storage in nodes.
 * Uses 'any' for input/output to allow heterogeneous tool collections.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyNodeToolDefinition<S = unknown> = NodeToolDefinition<any, any, S>;

/**
 * Anthropic tool definition format for API calls.
 */
export type AnthropicToolDefinition = Tool;
