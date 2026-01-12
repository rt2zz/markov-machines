import type { Charter } from "./charter.js";
import type { Node } from "./node.js";
import type { Message } from "./messages.js";
import type { Ref, SerialNode } from "./refs.js";

/**
 * Machine configuration for createMachine.
 */
export interface MachineConfig<R, S> {
  /** Node state */
  state: S;
  /** Root state (optional, uses charter.initialRootState if not provided) */
  rootState?: R;
  history?: Message[];
}

/**
 * Machine instance - the runtime context for running the agent.
 * R is the root state type, S is the current node's state type.
 */
export interface Machine<R = unknown, S = unknown> {
  /** Reference to the charter */
  charter: Charter<R>;
  /** Current node */
  node: Node<R, S>;
  /** Current node state */
  state: S;
  /** Root state (persists across transitions) */
  rootState: R;
  /** Conversation history */
  history: Message[];
}

/**
 * Serialized machine for persistence.
 */
export interface SerializedMachine<R = unknown, S = unknown> {
  /** Current node (inline or registry ref) */
  node: SerialNode<S> | Ref;
  /** Current node state */
  state: S;
  /** Root state (persists across transitions) */
  rootState: R;
  /** Full conversation history */
  history: Message[];
}
