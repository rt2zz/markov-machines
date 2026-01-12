import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, ContentBlock as AnthropicContentBlock } from "@anthropic-ai/sdk/resources/messages";
import type { Machine } from "../types/machine.js";
import type { Node } from "../types/node.js";
import type { RunOptions, RunResult } from "../types/charter.js";
import type { Message, ContentBlock, ToolResultBlock } from "../types/messages.js";
import type { Transition } from "../types/transitions.js";
import { userMessage, assistantMessage, toolResult, getMessageText } from "../types/messages.js";
import { generateToolDefinitions } from "../tools/tool-generator.js";
import { updateState } from "../runtime/state-manager.js";
import {
  executeCharterTool,
  executeNodeTool,
} from "../runtime/tool-executor.js";
import { executeTransition } from "../runtime/transition-executor.js";
import { isRef } from "../types/refs.js";
import type { Executor, StandardExecutorConfig } from "./types.js";

/**
 * Standard executor implementation using Anthropic SDK.
 * Implements the agentic loop with tool calls until text response.
 */
export class StandardExecutor implements Executor {
  private client: Anthropic;
  private defaultModel: string;

  constructor(config: StandardExecutorConfig = {}) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
    });
    this.defaultModel = config.model ?? "claude-sonnet-4-20250514";
  }

  async run<R, S>(
    machine: Machine<R, S>,
    input: string,
    options?: RunOptions,
  ): Promise<RunResult<R, S>> {
    const maxTurns = options?.maxTurns ?? 50;
    let currentState = machine.state;
    let currentRootState = machine.rootState;
    let currentNode = machine.node;
    const newMessages: Message[] = [];

    // Add user input message
    newMessages.push(userMessage(input));

    // Build conversation history for API
    const conversationHistory: MessageParam[] = [
      ...this.convertToAnthropicMessages(machine.history),
      { role: "user", content: input },
    ];

    let turns = 0;
    let stopReason: "end_turn" | "max_tokens" = "end_turn";

    while (turns < maxTurns) {
      turns++;

      // Generate tools for current node
      const tools = generateToolDefinitions(machine.charter, currentNode);

      // Build system prompt
      const systemPrompt = this.buildSystemPrompt(
        currentNode,
        currentRootState,
        currentState,
      );

      // Call Claude API
      console.log('create message', process.env.ANTHROPIC_API_KEY)
      const response = await this.client.messages.create({
        model: machine.charter.config.model ?? this.defaultModel,
        max_tokens: machine.charter.config.maxTokens ?? 4096,
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
            const patch = (toolInput as { patch: Partial<S> }).patch;
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

          // Check if this is a charter tool (defined on charter)
          if (name in machine.charter.tools) {
            // Execute charter tool (root state access only)
            const { result: toolResultStr, isError } = await executeCharterTool(
              machine.charter,
              name,
              toolInput,
              currentRootState,
              (patch) => {
                const updateResult = updateState(
                  currentRootState,
                  patch,
                  machine.charter.rootValidator,
                );
                if (updateResult.success) {
                  currentRootState = updateResult.state;
                }
              },
            );
            toolResults.push(toolResult(id, toolResultStr, isError));
            continue;
          }

          // Check if this is a node tool (defined inline on node)
          if (name in currentNode.tools) {
            // Execute node tool (node state access only)
            const { result: toolResultStr, isError } = await executeNodeTool(
              currentNode,
              name,
              toolInput,
              currentState,
              (patch) => {
                const updateResult = updateState(
                  currentState,
                  patch,
                  currentNode.validator,
                );
                if (updateResult.success) {
                  currentState = updateResult.state;
                }
              },
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

          // Determine which state to pass based on whether it's a charter or node transition
          // Ref transitions are charter-level (pass rootState), inline transitions are node-level (pass nodeState)
          const isCharterTransition = isRef(transition);
          const stateForTransition = isCharterTransition ? currentRootState : currentState;

          const result = await executeTransition(
            machine.charter,
            transition as Transition<unknown>,
            stateForTransition,
            queuedTransition.reason,
            queuedTransition.args,
          );

          currentNode = result.node as Node<S>;

          // Update state: use returned state, or node's initialState, or throw
          if (result.state !== undefined) {
            currentState = result.state as S;
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

    return {
      response,
      state: currentState,
      rootState: currentRootState,
      node: currentNode,
      messages: newMessages,
      stopReason,
    };
  }

  /**
   * Build system prompt for the current node.
   */
  protected buildSystemPrompt<R, S>(
    node: Node<S>,
    rootState: R,
    state: S,
  ): string {
    return `${node.instructions}

${this.buildRootStateSection(rootState)}

${this.buildStateSection(state)}

${this.buildTransitionsSection(node.transitions)}`;
  }

  /**
   * Build the root state section of the system prompt.
   */
  protected buildRootStateSection<R>(rootState: R): string {
    return `## Root State (persists across transitions)
\`\`\`json
${JSON.stringify(rootState, null, 2)}
\`\`\``;
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
   * Convert our Message format to Anthropic MessageParam format.
   */
  private convertToAnthropicMessages(messages: Message[]): MessageParam[] {
    return messages.map((msg) => ({
      role: msg.role,
      content:
        typeof msg.content === "string"
          ? msg.content
          : (msg.content.map((block) => {
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
                is_error: block.is_error,
              };
            }
            if (block.type === "thinking") {
              return { type: "text" as const, text: `[Thinking: ${block.thinking}]` };
            }
            return { type: "text" as const, text: JSON.stringify(block) };
          }) as MessageParam["content"]),
    }));
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
