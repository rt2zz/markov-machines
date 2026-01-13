import type { AnyToolDefinition } from "./tools.js";
import type { Transition } from "./transitions.js";
import type { Node } from "./node.js";
import type { Executor } from "../executor/types.js";

/**
 * Model configuration for executors.
 */
export interface ModelConfig {
  model: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Charter configuration for createCharter.
 * Charter is now purely static - a registry for serialization and ref resolution.
 */
export interface CharterConfig {
  name: string;
  /** Registered executors (for ref-based lookup) */
  executors?: Record<string, Executor>;
  /** Registered tools (for ref-based lookup, available to all nodes) */
  tools?: Record<string, AnyToolDefinition>;
  /** Registered transitions (for ref-based lookup) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transitions?: Record<string, Transition<any>>;
  /** Registered nodes (for ref-based lookup) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nodes?: Record<string, Node<any>>;
  /** Default model config for standard executors */
  config: ModelConfig;
}

/**
 * Charter instance - static registry of executors, tools, transitions, and nodes.
 * Charter has no state - it's purely for ref resolution and serialization.
 */
export interface Charter {
  name: string;
  /** Registered executors */
  executors: Record<string, Executor>;
  /** Registered tools (available to all nodes via ref resolution) */
  tools: Record<string, AnyToolDefinition>;
  /** Registered transitions */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transitions: Record<string, Transition<any>>;
  /** Registered nodes */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nodes: Record<string, Node<any>>;
  /** Default model config */
  config: ModelConfig;
}
