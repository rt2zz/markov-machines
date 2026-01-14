import type { Charter } from "./charter.js";
import type { Instance } from "./instance.js";
import type { Message } from "./messages.js";
import type { Ref, SerialNode } from "./refs.js";

/**
 * Machine configuration for createMachine.
 */
export interface MachineConfig {
  /** Root node instance (may have nested children) */
  instance: Instance;
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
  instance: Instance;
  /** Conversation history */
  history: Message[];
}

/**
 * Serialized node instance for persistence.
 */
export interface SerializedInstance {
  /** Unique instance ID */
  id: string;
  /** Node (inline or registry ref) */
  node: SerialNode | Ref;
  /** State for this node */
  state: unknown;
  /** Optional child instance(s) */
  child?: SerializedInstance | SerializedInstance[];
  /** Pack states (only on root instance) */
  packStates?: Record<string, unknown>;
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
