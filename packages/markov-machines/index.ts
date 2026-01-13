// Core functions
export { createCharter } from "./src/core/charter.js";
export { createNode } from "./src/core/node.js";
export { createMachine } from "./src/core/machine.js";
export { createTransition } from "./src/core/transition.js";
export type { TransitionConfig } from "./src/core/transition.js";
export { runMachine } from "./src/core/run.js";

// Executors
export { StandardExecutor, createStandardExecutor } from "./src/executor/standard.js";
export { VesselExecutor, createVesselExecutor } from "./src/executor/vessel.js";
export type {
  Executor,
  StandardExecutorConfig,
  VesselExecutorConfig,
  RunOptions,
  RunResult,
} from "./src/executor/types.js";

// Serialization
export { serializeNode, serializeInstance, serializeMachine } from "./src/serialization/serialize.js";
export { deserializeMachine, deserializeInstance, deserializeNode } from "./src/serialization/deserialize.js";

// Types
export type {
  // Charter
  Charter,
  CharterConfig,
  ModelConfig,
  // Node
  Node,
  NodeConfig,
  // Instance
  NodeInstance,
  // Machine
  Machine,
  MachineConfig,
  SerializedMachine,
  SerializedInstance,
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
  ToolContext,
  ToolDefinition,
  AnyToolDefinition,
  AnthropicToolDefinition,
  // Legacy tool aliases
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
  isNodeInstance,
  getLeafInstance,
  getInstancePath,
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
