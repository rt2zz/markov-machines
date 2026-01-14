import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  ContentBlock as AnthropicContentBlock,
} from "@anthropic-ai/sdk/resources/messages";
import type { Charter } from "../types/charter.js";
import type { Instance } from "../types/instance.js";
import { createInstance } from "../types/instance.js";
import type { Node } from "../types/node.js";
import type {
  Message,
  ContentBlock,
  ToolResultBlock,
} from "../types/messages.js";
import type { Transition } from "../types/transitions.js";
import {
  isTransitionToResult,
  isSpawnResult,
  isYieldResult,
} from "../types/transitions.js";
import {
  userMessage,
  assistantMessage,
  toolResult,
  getMessageText,
} from "../types/messages.js";
import { generateToolDefinitions } from "../tools/tool-generator.js";
import { updateState } from "../runtime/state-manager.js";
import { executeTool } from "../runtime/tool-executor.js";
import { executeTransition } from "../runtime/transition-executor.js";
import {
  resolveTool,
} from "../runtime/ref-resolver.js";
import { isAnthropicBuiltinTool } from "../types/tools.js";
import type {
  Executor,
  StandardExecutorConfig,
  RunOptions,
  RunResult,
} from "./types.js";

/**
 * Standard executor implementation using Anthropic SDK.
 * Implements the agentic loop with tool calls until text response.
 */
export class StandardExecutor implements Executor {
  type = "standard" as const;
  private client: Anthropic;
  private model: string;
  private maxTokens: number;

  constructor(config: StandardExecutorConfig = {}) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
    });
    this.model = config.model ?? "claude-sonnet-4-20250514";
    this.maxTokens = config.maxTokens ?? 4096;
  }

  async run(
    charter: Charter,
    instance: Instance,
    ancestors: Instance[],
    input: string,
    options?: RunOptions,
  ): Promise<RunResult> {
    const maxTurns = options?.maxTurns ?? 50;
    let currentState = instance.state;
    let currentNode = instance.node;
    let currentChildren = instance.child;
    const newMessages: Message[] = [];

    // Build ancestor state map for tool execution
    const ancestorStates = new Map<Instance, unknown>();
    for (const ancestor of ancestors) {
      ancestorStates.set(ancestor, ancestor.state);
    }

    // Get pack states from root instance (first ancestor or current instance)
    const rootInstance = ancestors[0] ?? instance;
    const packStates: Record<string, unknown> = { ...(rootInstance.packStates ?? {}) };

    // Add user input message
    newMessages.push(userMessage(input));

    // Build conversation history for API, including previous history
    const conversationHistory: MessageParam[] = [];

    // Add previous history if provided
    if (options?.history) {
      for (const msg of options.history) {
        conversationHistory.push(this.convertMessageToParam(msg));
      }
    }

    // Add current user input
    conversationHistory.push({ role: "user", content: input });

    let turns = 0;
    let stopReason: "end_turn" | "max_tokens" | "yield" = "end_turn";
    let yieldPayload: unknown = undefined;

    while (turns < maxTurns) {
      turns++;

      // Generate tools for current node (includes ancestor tools)
      const tools = generateToolDefinitions(
        charter,
        currentNode,
        ancestors.map((a) => a.node),
      );

      // Build system prompt
      const systemPrompt = this.buildSystemPrompt(
        charter,
        currentNode,
        currentState,
        ancestors,
        packStates,
      );

      // Call Claude API
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: systemPrompt,
        messages: conversationHistory,
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.input_schema as Anthropic.Messages.Tool["input_schema"],
        })),
      });

      // Convert response content to our format
      const assistantContent = this.convertContentBlocks(response.content);
      const assistantMsg = assistantMessage(assistantContent);
      newMessages.push(assistantMsg);
      conversationHistory.push({
        role: "assistant",
        content: response.content,
      });

      // Check stop reason
      if (response.stop_reason === "end_turn") {
        stopReason = "end_turn";
        break;
      }

      if (response.stop_reason === "max_tokens") {
        stopReason = "max_tokens";
        break;
      }

      // Process tool uses
      if (response.stop_reason === "tool_use") {
        const toolResults: ToolResultBlock[] = [];
        let queuedTransition: {
          name: string;
          reason: string;
          args: unknown;
        } | null = null;

        for (const block of response.content) {
          if (block.type !== "tool_use") continue;

          const { id, name, input: toolInput } = block;

          // Handle updateState
          if (name === "updateState") {
            const patch = (toolInput as { patch: Partial<unknown> }).patch;
            const result = updateState(
              currentState,
              patch,
              currentNode.validator,
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
          if (name === "transition") {
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
          if (name.startsWith("transition_")) {
            if (queuedTransition) {
              toolResults.push(
                toolResult(id, "Only one transition allowed per turn", true),
              );
              continue;
            }

            const transitionName = name.slice("transition_".length);
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
          const nodeToolEntry = currentNode.tools[name];
          if (nodeToolEntry && isAnthropicBuiltinTool(nodeToolEntry)) {
            // Builtin tools are handled server-side by Anthropic
            // The results are already in the response, no execution needed
            continue;
          }

          // Resolve and execute tool (walks up ancestor tree)
          const resolved = resolveTool(
            charter,
            { id: instance.id, node: currentNode, state: currentState },
            ancestors,
            name,
          );

          if (resolved) {
            const { tool, owner } = resolved;

            // Check if this is a pack tool
            if (typeof owner === "object" && "pack" in owner) {
              // Pack tool - use pack state
              const packName = owner.pack;
              const pack = charter.packs.find((p) => p.name === packName);
              if (!pack) {
                toolResults.push(toolResult(id, `Pack not found: ${packName}`, true));
                continue;
              }
              const packState = packStates[packName];

              // Execute pack tool with pack context
              try {
                const packTool = tool as { execute: (input: unknown, ctx: { state: unknown; updateState: (patch: Partial<unknown>) => void }) => Promise<unknown> | unknown };
                const result = await packTool.execute(toolInput, {
                  state: packState,
                  updateState: (patch: Partial<unknown>) => {
                    // Validate and update pack state
                    const merged = { ...(packState as object), ...patch };
                    const parseResult = pack.validator.safeParse(merged);
                    if (parseResult.success) {
                      packStates[packName] = parseResult.data;
                    }
                  },
                });
                toolResults.push(toolResult(id, typeof result === "string" ? result : JSON.stringify(result)));
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
                  currentNode.validator,
                );
                if (result.success) {
                  currentState = result.state;
                }
              };
            } else if (owner === instance || owner.node.id === currentNode.id) {
              toolState = currentState;
              onUpdate = (patch) => {
                const result = updateState(
                  currentState,
                  patch,
                  currentNode.validator,
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

            const { result: toolResultStr, isError } = await executeTool(
              tool,
              toolInput,
              toolState,
              onUpdate,
            );
            toolResults.push(toolResult(id, toolResultStr, isError));
            continue;
          }

          // Unknown tool
          toolResults.push(toolResult(id, `Unknown tool: ${name}`, true));
        }

        // Add tool results to conversation
        const toolResultMsg = userMessage(toolResults);
        newMessages.push(toolResultMsg);
        conversationHistory.push({
          role: "user",
          content: toolResults.map((r) => ({
            type: "tool_result" as const,
            tool_use_id: r.tool_use_id,
            content: r.content,
            is_error: r.is_error,
          })),
        });

        // Execute queued transition LAST
        if (queuedTransition) {
          const transition = currentNode.transitions[queuedTransition.name];
          if (!transition) {
            throw new Error(`Unknown transition: ${queuedTransition.name}`);
          }

          const result = await executeTransition(
            charter,
            transition as Transition<unknown>,
            currentState,
            queuedTransition.reason,
            queuedTransition.args,
          );

          // Handle discriminated union
          if (isYieldResult(result)) {
            // Yield: stop execution and return payload
            stopReason = "yield";
            yieldPayload = result.payload;
            break;
          }

          if (isSpawnResult(result)) {
            // Spawn: add children to current instance
            const newChildren = result.children.map(({ node, state }) =>
              createInstance(node, state ?? node.initialState),
            );

            // Append to existing children
            if (Array.isArray(currentChildren)) {
              currentChildren = [...currentChildren, ...newChildren];
            } else if (currentChildren) {
              currentChildren = [currentChildren, ...newChildren];
            } else {
              currentChildren =
                newChildren.length === 1 ? newChildren[0] : newChildren;
            }
            // Don't break - continue with current node
            continue;
          }

          // Normal transition (TransitionToResult)
          if (isTransitionToResult(result)) {
            currentNode = result.node as Node<unknown>;

            // Update state: use returned state, or node's initialState, or throw
            if (result.state !== undefined) {
              currentState = result.state;
            } else if (currentNode.initialState !== undefined) {
              currentState = currentNode.initialState;
            } else {
              throw new Error(
                `Transition returned undefined state and target node has no initialState`,
              );
            }
            // Clear children on transition to new node
            currentChildren = undefined;
          }
        }
      }
    }

    // Extract final text response
    const lastMessage = newMessages[newMessages.length - 1];
    const textResponse = lastMessage ? getMessageText(lastMessage) : "";

    // Build updated instance
    const updatedInstance = this.buildUpdatedInstance(
      instance,
      currentNode,
      currentState,
      currentChildren,
      ancestors,
      packStates,
    );

    return {
      response: textResponse,
      instance: updatedInstance,
      messages: newMessages,
      stopReason,
      yieldPayload,
      packStates: Object.keys(packStates).length > 0 ? packStates : undefined,
    };
  }

  /**
   * Build updated instance, propagating ancestor state changes.
   */
  private buildUpdatedInstance(
    originalInstance: Instance,
    currentNode: Node<unknown>,
    currentState: unknown,
    currentChildren: Instance | Instance[] | undefined,
    ancestors: Instance[],
    packStates: Record<string, unknown>,
  ): Instance {
    // Build the updated leaf instance
    // Include packStates only if this is the root instance (no ancestors)
    const isRoot = ancestors.length === 0;
    return {
      id: originalInstance.id,
      node: currentNode,
      state: currentState,
      child: currentChildren,
      ...(isRoot && Object.keys(packStates).length > 0 ? { packStates } : {}),
    };
  }

  /**
   * Build system prompt for the current node.
   */
  protected buildSystemPrompt<S>(
    charter: Charter,
    node: Node<S>,
    state: S,
    ancestors: Instance[],
    packStates: Record<string, unknown>,
  ): string {
    let prompt = `${node.instructions}

${this.buildStateSection(state)}

${this.buildTransitionsSection(node.transitions)}`;

    // Add ancestor context if any
    if (ancestors.length > 0) {
      prompt += `\n\n${this.buildAncestorContext(ancestors)}`;
    }

    // Add active packs section
    const packsSection = this.buildPacksSection(charter, node, packStates);
    if (packsSection) {
      prompt += `\n\n${packsSection}`;
    }

    return prompt;
  }

  /**
   * Build the active packs section of the system prompt.
   */
  protected buildPacksSection<S>(
    _charter: Charter,
    node: Node<S>,
    packStates: Record<string, unknown>,
  ): string {
    const activePacks = node.packs ?? [];
    if (activePacks.length === 0) return "";

    const sections = activePacks.map((pack) => {
      const state = packStates[pack.name];
      return `### ${pack.name}
${pack.description}
State: \`\`\`json
${JSON.stringify(state, null, 2)}
\`\`\``;
    });

    return `## Active Packs\n${sections.join("\n\n")}`;
  }

  /**
   * Build ancestor context section.
   */
  protected buildAncestorContext(ancestors: Instance[]): string {
    const sections = ancestors.map((ancestor, i) => {
      const depth = ancestors.length - i;
      return `### Ancestor ${depth}: ${ancestor.node.instructions.slice(0, 100)}...
State: ${JSON.stringify(ancestor.state, null, 2)}`;
    });

    return `## Ancestor Context
${sections.join("\n\n")}`;
  }

  /**
   * Build the state section of the system prompt.
   */
  protected buildStateSection<S>(state: S): string {
    return `## Current Node State
\`\`\`json
${JSON.stringify(state, null, 2)}
\`\`\``;
  }

  /**
   * Build the transitions section of the system prompt.
   */
  protected buildTransitionsSection<S>(
    transitions: Record<string, Transition<S>>,
  ): string {
    const transitionList = Object.entries(transitions)
      .map(([name, t]) => {
        let desc = "Transition";
        if ("description" in t && typeof t.description === "string") {
          desc = t.description;
        }
        return `- **${name}**: ${desc}`;
      })
      .join("\n");

    return `## Available Transitions
${transitionList || "None"}`;
  }

  /**
   * Convert Anthropic content blocks to our format.
   */
  private convertContentBlocks(
    blocks: AnthropicContentBlock[],
  ): ContentBlock[] {
    return blocks.map((block) => {
      if (block.type === "text") {
        return { type: "text", text: block.text };
      }
      if (block.type === "tool_use") {
        return {
          type: "tool_use",
          id: block.id,
          name: block.name,
          input: block.input,
        };
      }
      // Handle thinking blocks if present
      if (
        "thinking" in block &&
        typeof (block as { thinking?: string }).thinking === "string"
      ) {
        return {
          type: "thinking",
          thinking: (block as { thinking: string }).thinking,
        };
      }
      // Fallback
      return { type: "text", text: JSON.stringify(block) };
    });
  }

  /**
   * Convert our Message format to Anthropic MessageParam format.
   */
  private convertMessageToParam(msg: Message): MessageParam {
    if (typeof msg.content === "string") {
      return { role: msg.role, content: msg.content };
    }

    // Convert our ContentBlock[] to Anthropic's format
    const content = msg.content.map((block) => {
      if (block.type === "text") {
        return { type: "text" as const, text: block.text };
      }
      if (block.type === "tool_use") {
        return {
          type: "tool_use" as const,
          id: block.id,
          name: block.name,
          input: block.input,
        };
      }
      if (block.type === "tool_result") {
        return {
          type: "tool_result" as const,
          tool_use_id: block.tool_use_id,
          content: block.content,
          ...(block.is_error !== undefined && { is_error: block.is_error }),
        };
      }
      // Thinking blocks - skip or convert
      return { type: "text" as const, text: "" };
    }).filter((b) => b.type !== "text" || b.text !== "");

    return { role: msg.role, content };
  }
}

/**
 * Create a standard executor instance.
 */
export function createStandardExecutor(
  config?: StandardExecutorConfig,
): StandardExecutor {
  return new StandardExecutor(config);
}
