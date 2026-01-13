import type { Charter } from "./charter.js";
import type { NodeInstance } from "./instance.js";
import type { Message } from "./messages.js";
import type { Ref, SerialNode } from "./refs.js";

/**
 * Machine configuration for createMachine.
 */
export interface MachineConfig {
  /** Root node instance (may have nested children) */
  instance: NodeInstance;
  /** Conversation history */
  history?: Message[];
}

/**
 * Machine instance - the runtime context for running the agent.
 * Contains the charter and the node instance tree.
 */
export interface Machine {
  /** Reference to the charter (static registry) */
  charter: Charter;
  /** Root node instance (may have nested children) */
  instance: NodeInstance;
  /** Conversation history */
  history: Message[];
}

/**
 * Serialized node instance for persistence.
 */
export interface SerializedInstance {
  /** Node (inline or registry ref) */
  node: SerialNode | Ref;
  /** State for this node */
  state: unknown;
  /** Optional child instance */
  child?: SerializedInstance;
}

/**
 * Serialized machine for persistence.
 */
export interface SerializedMachine {
  /** Root instance tree */
  instance: SerializedInstance;
  /** Full conversation history */
  history: Message[];
}
