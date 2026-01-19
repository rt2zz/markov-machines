import type { Charter } from "../types/charter.js";
import type { Instance } from "../types/instance.js";
import type { Node } from "../types/node.js";
import type {
  ToolResultBlock,
  TextBlock,
  OutputBlock,
} from "../types/messages.js";
import { toolResult } from "../types/messages.js";
import { updateState } from "./state-manager.js";
import { executeTool } from "./tool-executor.js";
import { resolveTool } from "./ref-resolver.js";
import { isAnthropicBuiltinTool } from "../types/tools.js";

// Tool name constants
const TOOL_UPDATE_STATE = "updateState";
const TOOL_TRANSITION = "transition";
const TRANSITION_PREFIX = "transition_";

export interface ToolCallContext {
  charter: Charter;
  instance: Instance;
  ancestors: Instance[];
  packStates: Record<string, unknown>;
  currentState: unknown;
  currentNode: Node<unknown>;
}

export interface ToolCallResult {
  toolResults: (ToolResultBlock | TextBlock | OutputBlock<unknown>)[];
  currentState: unknown;
  packStates: Record<string, unknown>;
  ancestorStates: Map<Instance, unknown>;
  queuedTransition?: { name: string; reason: string; args: unknown };
}

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

/**
 * Process tool calls from an API response.
 * Handles updateState, transitions, pack tools, and regular node tools.
 */
export async function processToolCalls(
  ctx: ToolCallContext,
  toolCalls: ToolCall[],
): Promise<ToolCallResult> {
  const toolResults: (ToolResultBlock | TextBlock | OutputBlock<unknown>)[] = [];
  let currentState = ctx.currentState;
  const packStates = { ...ctx.packStates };
  let queuedTransition: { name: string; reason: string; args: unknown } | undefined;

  // Build ancestor state map for tool execution
  const ancestorStates = new Map<Instance, unknown>();
  for (const ancestor of ctx.ancestors) {
    ancestorStates.set(ancestor, ancestor.state);
  }

  for (const { id, name, input: toolInput } of toolCalls) {
    // Handle updateState
    if (name === TOOL_UPDATE_STATE) {
      const patch = (toolInput as { patch: Partial<unknown> }).patch;
      const result = updateState(
        currentState,
        patch,
        ctx.currentNode.validator,
      );

      if (result.success) {
        currentState = result.state;
        toolResults.push(toolResult(id, "State updated successfully"));
      } else {
        toolResults.push(
          toolResult(id, `State update failed: ${result.error}`, true),
        );
      }
      continue;
    }

    // Handle default transition tool
    if (name === TOOL_TRANSITION) {
      if (queuedTransition) {
        toolResults.push(
          toolResult(id, "Only one transition allowed per turn", true),
        );
        continue;
      }

      const { to, reason } = toolInput as { to: string; reason: string };
      queuedTransition = { name: to, reason, args: {} };
      toolResults.push(toolResult(id, `Transition to "${to}" queued`));
      continue;
    }

    // Handle named transition tools
    if (name.startsWith(TRANSITION_PREFIX)) {
      if (queuedTransition) {
        toolResults.push(
          toolResult(id, "Only one transition allowed per turn", true),
        );
        continue;
      }

      const transitionName = name.slice(TRANSITION_PREFIX.length);
      const { reason, ...args } = toolInput as {
        reason: string;
        [key: string]: unknown;
      };
      queuedTransition = { name: transitionName, reason, args };
      toolResults.push(
        toolResult(id, `Transition to "${transitionName}" queued`),
      );
      continue;
    }

    // Check if this is an Anthropic builtin tool (server-side, handled by API)
    const nodeToolEntry = ctx.currentNode.tools[name];
    if (nodeToolEntry && isAnthropicBuiltinTool(nodeToolEntry)) {
      // Builtin tools are handled server-side by Anthropic
      // The results are already in the response, no execution needed
      continue;
    }

    // Resolve and execute tool (walks up ancestor tree)
    const resolved = resolveTool(
      ctx.charter,
      { id: ctx.instance.id, node: ctx.currentNode, state: currentState },
      ctx.ancestors,
      name,
    );

    if (resolved) {
      const { tool, owner } = resolved;

      // Check if this is a pack tool
      if (typeof owner === "object" && "pack" in owner) {
        // Pack tool - use pack state
        const packName = owner.pack;
        const pack = ctx.charter.packs.find((p) => p.name === packName);
        if (!pack) {
          toolResults.push(toolResult(id, `Pack not found: ${packName}`, true));
          continue;
        }
        const packState = packStates[packName] ?? pack.initialState;

        // Execute pack tool with pack context
        try {
          const packTool = tool as {
            execute: (
              input: unknown,
              ctx: { state: unknown; updateState: (patch: Partial<unknown>) => void },
            ) => Promise<unknown> | unknown;
          };
          const result = await packTool.execute(toolInput, {
            state: packState,
            updateState: (patch: Partial<unknown>) => {
              // Validate and update pack state
              const merged = { ...(packState ?? {}), ...patch };
              const parseResult = pack.validator.safeParse(merged);
              if (parseResult.success) {
                packStates[packName] = parseResult.data;
              }
            },
          });
          toolResults.push(
            toolResult(id, typeof result === "string" ? result : JSON.stringify(result)),
          );
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          toolResults.push(toolResult(id, `Tool error: ${errorMsg}`, true));
        }
        continue;
      }

      // Skip Anthropic builtin tools (handled server-side)
      if (isAnthropicBuiltinTool(tool)) {
        continue;
      }

      // Non-pack tool - determine which state to use and how to update it
      let toolState: unknown;
      let onUpdate: (patch: Partial<unknown>) => void;

      if (owner === "charter") {
        toolState = currentState;
        onUpdate = (patch) => {
          const result = updateState(
            currentState,
            patch,
            ctx.currentNode.validator,
          );
          if (result.success) {
            currentState = result.state;
          }
        };
      } else if (owner === ctx.instance || owner.node.id === ctx.currentNode.id) {
        toolState = currentState;
        onUpdate = (patch) => {
          const result = updateState(
            currentState,
            patch,
            ctx.currentNode.validator,
          );
          if (result.success) {
            currentState = result.state;
          }
        };
      } else {
        toolState = ancestorStates.get(owner) ?? owner.state;
        onUpdate = (patch) => {
          const ownerState = ancestorStates.get(owner) ?? owner.state;
          const result = updateState(
            ownerState,
            patch,
            owner.node.validator,
          );
          if (result.success) {
            ancestorStates.set(owner, result.state);
          }
        };
      }

      const {
        result: toolResultStr,
        isError,
        userMessage,
      } = await executeTool(tool, toolInput, toolState, onUpdate);
      toolResults.push(toolResult(id, toolResultStr, isError));
      // Add user message block if present (from toolReply)
      if (userMessage !== undefined) {
        if (typeof userMessage === "string") {
          toolResults.push({ type: "text", text: userMessage });
        } else {
          toolResults.push({ type: "output", data: userMessage });
        }
      }
      continue;
    }

    // Unknown tool
    toolResults.push(toolResult(id, `Unknown tool: ${name}`, true));
  }

  return {
    toolResults,
    currentState,
    packStates,
    ancestorStates,
    queuedTransition,
  };
}
