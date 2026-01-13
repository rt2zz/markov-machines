// Refs
export type { Ref, SerialNode, SerialTransition, JSONSchema } from "./refs.js";
export { isRef, isSerialNode, isSerialTransition } from "./refs.js";

// Tools
export type {
  ToolContext,
  ToolDefinition,
  AnyToolDefinition,
  AnthropicToolDefinition,
  // Legacy aliases
  CharterToolContext,
  NodeToolContext,
  CharterToolDefinition,
  NodeToolDefinition,
  AnyCharterToolDefinition,
  AnyNodeToolDefinition,
} from "./tools.js";

// Transitions
export type {
  Transition,
  CodeTransition,
  GeneralTransition,
  TransitionContext,
  TransitionResult,
} from "./transitions.js";
export {
  transitionTo,
  isCodeTransition,
  isGeneralTransition,
  transitionHasArguments,
} from "./transitions.js";

// State
export type { StateUpdateResult } from "./state.js";
export { deepMerge } from "./state.js";

// Node
export type { Node, NodeConfig } from "./node.js";
export { isNode } from "./node.js";

// Instance
export type { NodeInstance } from "./instance.js";
export { isNodeInstance, getLeafInstance, getInstancePath } from "./instance.js";

// Charter
export type {
  Charter,
  CharterConfig,
  ModelConfig,
} from "./charter.js";

// Messages
export type {
  Message,
  ContentBlock,
  TextBlock,
  ToolUseBlock,
  ToolResultBlock,
  ThinkingBlock,
} from "./messages.js";
export {
  userMessage,
  assistantMessage,
  toolResult,
  getMessageText,
} from "./messages.js";

// Machine
export type { Machine, MachineConfig, SerializedMachine, SerializedInstance } from "./machine.js";
