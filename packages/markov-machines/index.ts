// Core functions
export { createCharter } from "./src/core/charter.js";
export { createNode } from "./src/core/node.js";
export { createMachine } from "./src/core/machine.js";
export { createTransition, createHelpers } from "./src/core/transition.js";
export type { TransitionConfig } from "./src/core/transition.js";
export { runMachine } from "./src/core/run.js";
export { createPack } from "./src/core/pack.js";

// Executors
export { StandardExecutor, createStandardExecutor } from "./src/executor/standard.js";
export type {
  Executor,
  StandardExecutorConfig,
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
  // Node
  Node,
  NodeConfig,
  // Instance
  Instance,
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
  TransitionToResult,
  SpawnResult,
  YieldResult,
  SpawnTarget,
  TransitionHelpers,
  // Tools
  ToolContext,
  ToolDefinition,
  AnyToolDefinition,
  AnthropicToolDefinition,
  AnthropicBuiltinTool,
  // Messages
  Message,
  ContentBlock,
  TextBlock,
  ToolUseBlock,
  ToolResultBlock,
  ThinkingBlock,
  // Pack
  Pack,
  PackConfig,
  PackToolDefinition,
  PackToolContext,
  AnyPackToolDefinition,
} from "./src/types/index.js";

// Type guards and helpers
export {
  isRef,
  isSerialNode,
  isSerialTransition,
  isNode,
  isInstance,
  createInstance,
  getActiveInstance,
  getInstancePath,
  getAllInstances,
  isCodeTransition,
  isGeneralTransition,
  transitionHasArguments,
  transitionTo,
  isTransitionToResult,
  isSpawnResult,
  isYieldResult,
  isPack,
  isPackToolDefinition,
  isAnthropicBuiltinTool,
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
