// Core functions
export { createCharter } from "./src/core/charter.js";
export { createNode } from "./src/core/node.js";
export { createMachine } from "./src/core/machine.js";
export { createTransition } from "./src/core/transition.js";
export type { TransitionConfig } from "./src/core/transition.js";
export { runMachine } from "./src/core/run.js";

// Executor
export { StandardExecutor } from "./src/executor/standard.js";
export type { Executor, StandardExecutorConfig } from "./src/executor/types.js";

// Serialization
export { serializeNode, serializeMachine } from "./src/serialization/serialize.js";
export { deserializeMachine, deserializeNode } from "./src/serialization/deserialize.js";

// Types
export type {
  // Charter
  Charter,
  CharterConfig,
  ModelConfig,
  RunOptions,
  RunResult,
  // Node
  Node,
  NodeConfig,
  // Machine
  Machine,
  MachineConfig,
  SerializedMachine,
  // Refs
  Ref,
  SerialNode,
  SerialTransition,
  JSONSchema,
  // Transitions
  Transition,
  CodeTransition,
  GeneralTransition,
  TransitionContext,
  TransitionResult,
  // Tools
  CharterToolContext,
  NodeToolContext,
  CharterToolDefinition,
  NodeToolDefinition,
  AnyCharterToolDefinition,
  AnyNodeToolDefinition,
  // Messages
  Message,
  ContentBlock,
  TextBlock,
  ToolUseBlock,
  ToolResultBlock,
  ThinkingBlock,
} from "./src/types/index.js";

// Type guards and helpers
export {
  isRef,
  isSerialNode,
  isSerialTransition,
  isNode,
  isCodeTransition,
  isGeneralTransition,
  transitionHasArguments,
  transitionTo,
} from "./src/types/index.js";

// Message helpers
export {
  userMessage,
  assistantMessage,
  toolResult,
  getMessageText,
} from "./src/types/messages.js";

// State helpers
export { deepMerge } from "./src/types/state.js";
