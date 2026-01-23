import type { AnyToolDefinition } from "./tools.js";
import type { Transition } from "./transitions.js";
import type { Node } from "./node.js";
import type { Executor } from "../executor/types.js";
import type { Pack } from "./pack.js";
import type { Instance } from "./instance.js";
import type { SystemPromptOptions } from "../runtime/system-prompt.js";

/**
 * Custom system prompt builder function type.
 * Allows applications to override the default system prompt generation.
 * @typeParam AppMessage - The application message type for structured outputs.
 */
export type SystemPromptBuilder<AppMessage = unknown> = <S>(
  charter: Charter,
  node: Node<S, AppMessage>,
  state: S,
  ancestors: Instance[],
  packStates: Record<string, unknown>,
  options?: SystemPromptOptions
) => string;

/**
 * Charter configuration for createCharter.
 * Charter is purely static - a registry for serialization and ref resolution.
 * @typeParam AppMessage - The application message type for structured outputs (defaults to unknown).
 */
export interface CharterConfig<AppMessage = unknown> {
  name: string;
  /** Single executor for running nodes */
  executor: Executor<AppMessage>;
  /** Registered tools (for ref-based lookup, available to all nodes) */
  tools?: Record<string, AnyToolDefinition>;
  /** Registered transitions (for ref-based lookup) */
  transitions?: Record<string, Transition<unknown>>;
  /**
   * Registered nodes (for ref-based lookup).
   * Nodes must output AppMessage or have no output.
   */
  nodes?: Record<string, Node<unknown, AppMessage> | Node<unknown, never>>;
  /** Registered packs (reusable modules with state and tools) */
  packs?: Pack<unknown>[];
  /**
   * Optional custom system prompt builder.
   * If provided, this function will be used instead of the default system prompt builder.
   */
  buildSystemPrompt?: SystemPromptBuilder<AppMessage>;
}

/**
 * Charter instance - static registry with single executor, tools, transitions, and nodes.
 * Charter has no state - state lives in NodeInstances.
 * @typeParam AppMessage - The application message type for structured outputs (defaults to unknown).
 */
export interface Charter<AppMessage = unknown> {
  name: string;
  /** Single executor for running nodes */
  executor: Executor<AppMessage>;
  /** Registered tools (available to all nodes via ref resolution) */
  tools: Record<string, AnyToolDefinition>;
  /** Registered transitions */
  transitions: Record<string, Transition<unknown>>;
  /**
   * Registered nodes.
   * Nodes must output AppMessage or have no output.
   */
  nodes: Record<string, Node<unknown, AppMessage> | Node<unknown, never>>;
  /** Registered packs */
  packs: Pack<unknown>[];
  /**
   * Optional custom system prompt builder.
   * If provided, this function will be used instead of the default system prompt builder.
   */
  buildSystemPrompt?: SystemPromptBuilder<AppMessage>;
}
