import type { z } from "zod";
import type { AnyCharterToolDefinition } from "./tools.js";
import type { Transition } from "./transitions.js";
import type { Node } from "./node.js";

/**
 * Model configuration for the executor.
 */
export interface ModelConfig {
  model: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Executor interface for running the agent loop.
 */
export interface Executor {
  run<R, S>(
    machine: Machine<R, S>,
    input: string,
    options?: RunOptions
  ): Promise<RunResult<R, S>>;
}

/**
 * Options for runMachine.
 */
export interface RunOptions {
  maxTurns?: number;
  signal?: AbortSignal;
}

/**
 * Result returned from runMachine.
 * Contains deltas (not full machine) for composability.
 */
export interface RunResult<R, S> {
  /** Text response from the agent */
  response: string;
  /** Updated node state after all updateState calls */
  state: S;
  /** Updated root state (persists across transitions) */
  rootState: R;
  /** Current node (may have transitioned) */
  node: Node<R, S>;
  /** New messages from this turn */
  messages: Message[];
  /** Why the run stopped */
  stopReason: "end_turn" | "max_tokens";
}

/**
 * Charter configuration for createCharter.
 */
export interface CharterConfig<R = unknown> {
  name: string;
  executor: Executor;
  /** Charter tools - only have access to root state */
  tools?: Record<string, AnyCharterToolDefinition<R>>;
  /** Registered transitions (different transitions may have different state types) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transitions?: Record<string, Transition<R, any>>;
  /** Registered nodes (different nodes may have different state types) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nodes?: Record<string, Node<R, any>>;
  config: ModelConfig;
  /** Zod validator for root state. Defaults to z.object({}) if not provided. */
  rootValidator?: z.ZodType<R>;
  /** Initial root state. Defaults to {} if not provided. */
  initialRootState?: R;
}

/**
 * Charter instance - the registry of tools, transitions, and nodes.
 * Only parameterized by root state type R since different nodes
 * can have different state types.
 */
export interface Charter<R = unknown> {
  name: string;
  executor: Executor;
  /** Charter tools - only have access to root state */
  tools: Record<string, AnyCharterToolDefinition<R>>;
  /** Registered transitions (different transitions may have different state types) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transitions: Record<string, Transition<R, any>>;
  /** Registered nodes (different nodes may have different state types) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nodes: Record<string, Node<R, any>>;
  config: ModelConfig;
  /** Zod validator for root state */
  rootValidator: z.ZodType<R>;
  /** Initial root state */
  initialRootState: R;
}

// Forward declaration - actual type in machine.ts
import type { Machine } from "./machine.js";
import type { Message } from "./messages.js";
