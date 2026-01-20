import type { z } from "zod";
import type { Node } from "./node.js";
import type { Message } from "./messages.js";
import type {
  CedeResult,
  SpawnResult,
  SpawnTarget,
  SpawnOptions,
  TransitionToResult,
} from "./transitions.js";

/**
 * Context passed to command execute functions.
 * S is the state type of the current node.
 */
export interface CommandContext<S = unknown> {
  /** Current state */
  state: S;
  /** Update state with a partial patch */
  updateState: (patch: Partial<S>) => void;
  /** Cede control back to parent with optional content (string or Message[]) */
  cede: <M = unknown>(content?: string | Message<M>[]) => CedeResult<M>;
  /** Spawn one or more child instances */
  spawn: <T = unknown>(
    nodeOrTargets: Node<T> | SpawnTarget<T>[],
    state?: T,
    options?: SpawnOptions,
  ) => SpawnResult<T>;
}

/**
 * Command definition.
 * Commands are user-callable methods that bypass LLM inference.
 * S is the state type this command operates on.
 */
export interface CommandDefinition<
  TInput = unknown,
  TOutput = unknown,
  S = unknown,
> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  execute: (
    input: TInput,
    ctx: CommandContext<S>,
  ) => Promise<CommandResult<TOutput>> | CommandResult<TOutput>;
}

/**
 * Base command definition type for storage.
 * Uses 'any' for input/output to allow heterogeneous command collections.
 */
// Heterogeneous collections cannot preserve specific input/output types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyCommandDefinition<S = unknown> = CommandDefinition<any, any, S>;

/**
 * Value result - command completed with a return value.
 */
export interface ValueResult<T = unknown> {
  type: "value";
  value: T;
}

/**
 * Union of all command results.
 * Commands can return a value, transition, spawn, or cede.
 */
export type CommandResult<T = unknown> =
  | ValueResult<T>
  | TransitionToResult
  | SpawnResult
  | CedeResult;

/**
 * Type guard for ValueResult.
 */
export function isValueResult<T>(result: CommandResult<T>): result is ValueResult<T> {
  return (
    typeof result === "object" &&
    result !== null &&
    "type" in result &&
    result.type === "value"
  );
}

/**
 * Helper to create a value result.
 */
export function commandValue<T>(value: T): ValueResult<T> {
  return { type: "value", value };
}

/**
 * Info about a command for frontend display.
 */
export interface CommandInfo {
  name: string;
  description: string;
  inputSchema: z.ZodType;
}

/**
 * Object representing a command invocation.
 * Can be passed to runMachine to execute a command directly without LLM inference.
 */
export interface Command {
  type: "command";
  name: string;
  input: unknown;
}

/**
 * Type guard for Command.
 */
export function isCommand(value: unknown): value is Command {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "command" &&
    "name" in value &&
    typeof value.name === "string"
  );
}

/**
 * Result of executing a command.
 */
export interface CommandExecutionResult<T = unknown> {
  success: boolean;
  value?: T;
  error?: string;
}
