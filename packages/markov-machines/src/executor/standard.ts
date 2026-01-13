import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, ContentBlock as AnthropicContentBlock } from "@anthropic-ai/sdk/resources/messages";
import type { Charter } from "../types/charter.js";
import type { NodeInstance } from "../types/instance.js";
import type { Node } from "../types/node.js";
import type { Message, ContentBlock, ToolResultBlock } from "../types/messages.js";
import type { Transition } from "../types/transitions.js";
import { userMessage, assistantMessage, toolResult, getMessageText } from "../types/messages.js";
import { generateToolDefinitions } from "../tools/tool-generator.js";
import { updateState } from "../runtime/state-manager.js";
import { executeTool } from "../runtime/tool-executor.js";
import { executeTransition } from "../runtime/transition-executor.js";
import { resolveTool, collectAvailableTools } from "../runtime/ref-resolver.js";
import type { Executor, StandardExecutorConfig, RunOptions, RunResult } from "./types.js";

/**
 * Standard executor implementation using Anthropic SDK.
 * Implements the agentic loop with tool calls until text response.
 * Does NOT support children - this is a leaf executor.
 */
export class StandardExecutor implements Executor {
  type = "standard" as const;
  private client: Anthropic;
  private defaultModel: string;

  constructor(config: StandardExecutorConfig = {}) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
    });
    this.defaultModel = config.model ?? "claude-sonnet-4-20250514";
  }

  async run(
    charter: Charter,
    instance: NodeInstance,
    ancestors: NodeInstance[],
    input: string,
    options?: RunOptions,
  ): Promise<RunResult> {
    const maxTurns = options?.maxTurns ?? 50;
    let currentState = instance.state;
    let currentNode = instance.node;
    const newMessages: Message[] = [];

    // Build ancestor state map for tool execution
    // We'll need to track which ancestors have been updated
    const ancestorStates = new Map<NodeInstance, unknown>();
    for (const ancestor of ancestors) {
      ancestorStates.set(ancestor, ancestor.state);
    }

    // Add user input message
    newMessages.push(userMessage(input));

    // Build conversation history for API
    // Note: We don't have access to machine.history here, caller should handle that
    const conversationHistory: MessageParam[] = [
      { role: "user", content: input },
    ];

    let turns = 0;
    let stopReason: "end_turn" | "max_tokens" | "delegated" = "end_turn";

    while (turns < maxTurns) {
      turns++;

      // Generate tools for current node (includes ancestor tools)
      const tools = generateToolDefinitions(charter, currentNode, ancestors.map(a => a.node));

      // Build system prompt
      const systemPrompt = this.buildSystemPrompt(currentNode, currentState, ancestors);

      // Call Claude API
      const response = await this.client.messages.create({
        model: charter.config.model ?? this.defaultModel,
        max_tokens: charter.config.maxTokens ?? 4096,
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
            const result = updateState(currentState, patch, currentNode.validator);

            if (result.success) {
              currentState = result.state;
              toolResults.push(toolResult(id, "State updated successfully"));
            } else {
              toolResults.push(
                toolResult(id, `State update failed: ${result.error}`, true)
              );
            }
            continue;
          }

          // Handle default transition tool
          if (name === "transition") {
            if (queuedTransition) {
              toolResults.push(
                toolResult(id, "Only one transition allowed per turn", true)
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
                toolResult(id, "Only one transition allowed per turn", true)
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
              toolResult(id, `Transition to "${transitionName}" queued`)
            );
            continue;
          }

          // Resolve and execute tool (walks up ancestor tree)
          const resolved = resolveTool(charter, { node: currentNode, state: currentState }, ancestors, name);

          if (resolved) {
            const { tool, owner } = resolved;

            // Determine which state to use and how to update it
            let toolState: unknown;
            let onUpdate: (patch: Partial<unknown>) => void;

            if (owner === "charter") {
              // Charter tools don't have state access in new architecture
              // They operate statelessly or we need a different approach
              // For now, give them access to current node state
              toolState = currentState;
              onUpdate = (patch) => {
                const result = updateState(currentState, patch, currentNode.validator);
                if (result.success) {
                  currentState = result.state;
                }
              };
            } else if (owner === instance || owner.node.id === currentNode.id) {
              // Current node's tool
              toolState = currentState;
              onUpdate = (patch) => {
                const result = updateState(currentState, patch, currentNode.validator);
                if (result.success) {
                  currentState = result.state;
                }
              };
            } else {
              // Ancestor tool - use and update ancestor's state
              toolState = ancestorStates.get(owner) ?? owner.state;
              onUpdate = (patch) => {
                const ownerState = ancestorStates.get(owner) ?? owner.state;
                const result = updateState(ownerState, patch, owner.node.validator);
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
          toolResults.push(
            toolResult(id, `Unknown tool: ${name}`, true),
          );
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

          currentNode = result.node as Node<unknown>;

          // Update state: use returned state, or node's initialState, or throw
          if (result.state !== undefined) {
            currentState = result.state;
          } else if (currentNode.initialState !== undefined) {
            currentState = currentNode.initialState;
          } else {
            throw new Error(
              `Transition returned undefined state and target node has no initialState`
            );
          }
        }
      }
    }

    // Extract final text response
    const lastMessage = newMessages[newMessages.length - 1];
    const response = lastMessage ? getMessageText(lastMessage) : "";

    // Build updated instance with any ancestor state changes
    const updatedInstance = this.buildUpdatedInstance(
      instance,
      currentNode,
      currentState,
      ancestors,
      ancestorStates,
    );

    return {
      response,
      instance: updatedInstance,
      messages: newMessages,
      stopReason,
    };
  }

  /**
   * Build updated instance, propagating ancestor state changes.
   */
  private buildUpdatedInstance(
    originalInstance: NodeInstance,
    currentNode: Node<unknown>,
    currentState: unknown,
    ancestors: NodeInstance[],
    ancestorStates: Map<NodeInstance, unknown>,
  ): NodeInstance {
    // For now, just update the leaf instance
    // TODO: Properly propagate ancestor state changes up the tree
    return {
      node: currentNode,
      state: currentState,
      child: originalInstance.child,
    };
  }

  /**
   * Build system prompt for the current node.
   */
  protected buildSystemPrompt<S>(
    node: Node<S>,
    state: S,
    ancestors: NodeInstance[],
  ): string {
    let prompt = `${node.instructions}

${this.buildStateSection(state)}

${this.buildTransitionsSection(node.transitions)}`;

    // Add ancestor context if any
    if (ancestors.length > 0) {
      prompt += `\n\n${this.buildAncestorContext(ancestors)}`;
    }

    return prompt;
  }

  /**
   * Build ancestor context section.
   */
  protected buildAncestorContext(ancestors: NodeInstance[]): string {
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
    blocks: AnthropicContentBlock[]
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
      if ("thinking" in block && typeof (block as { thinking?: string }).thinking === "string") {
        return {
          type: "thinking",
          thinking: (block as { thinking: string }).thinking,
        };
      }
      // Fallback
      return { type: "text", text: JSON.stringify(block) };
    });
  }
}

/**
 * Create a standard executor instance.
 */
export function createStandardExecutor(config?: StandardExecutorConfig): StandardExecutor {
  return new StandardExecutor(config);
}
