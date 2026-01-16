import type { AnyToolDefinition } from "./tools.js";
import type { Transition } from "./transitions.js";
import type { Node } from "./node.js";
import type { Executor } from "../executor/types.js";
import type { Pack } from "./pack.js";

/**
 * Charter configuration for createCharter.
 * Charter is purely static - a registry for serialization and ref resolution.
 */
export interface CharterConfig {
  name: string;
  /** Single executor for running nodes */
  executor: Executor;
  /** Registered tools (for ref-based lookup, available to all nodes) */
  tools?: Record<string, AnyToolDefinition>;
  /** Registered transitions (for ref-based lookup) */
  // Registry holds items with heterogeneous state types, requiring `any`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transitions?: Record<string, Transition<any>>;
  /** Registered nodes (for ref-based lookup) */
  // Registry holds items with heterogeneous state types, requiring `any`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nodes?: Record<string, Node<any>>;
  /** Registered packs (reusable modules with state and tools) */
  // Registry holds items with heterogeneous state types, requiring `any`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  packs?: Pack<any>[];
}

/**
 * Charter instance - static registry with single executor, tools, transitions, and nodes.
 * Charter has no state - state lives in NodeInstances.
 */
export interface Charter {
  name: string;
  /** Single executor for running nodes */
  executor: Executor;
  /** Registered tools (available to all nodes via ref resolution) */
  tools: Record<string, AnyToolDefinition>;
  /** Registered transitions */
  // Registry holds items with heterogeneous state types, requiring `any`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transitions: Record<string, Transition<any>>;
  /** Registered nodes */
  // Registry holds items with heterogeneous state types, requiring `any`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nodes: Record<string, Node<any>>;
  /** Registered packs */
  // Registry holds items with heterogeneous state types, requiring `any`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  packs: Pack<any>[];
}
