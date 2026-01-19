import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
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
  OutputBlock,
} from "../types/messages.js";
import type { Transition } from "../types/transitions.js";
import {
  isTransitionToResult,
  isSpawnResult,
  isCedeResult,
} from "../types/transitions.js";
import {
  userMessage,
  assistantMessage,
  toolResult,
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

// Tool name constants
const TOOL_UPDATE_STATE = "updateState";
const TOOL_TRANSITION = "transition";
const TRANSITION_PREFIX = "transition_";

/**
 * Standard executor implementation using Anthropic SDK.
 * Makes exactly ONE API call per run(), processes tools, and returns.
 */
export class StandardExecutor implements Executor<unknown> {
  type = "standard" as const;
  private client: Anthropic;
  private model: string;
  private maxTokens: number;
  private debug: boolean;

  constructor(config: StandardExecutorConfig = {}) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
      logLevel: config.debug ? "debug" : undefined,
    });
    this.model = config.model ?? "claude-sonnet-4-20250514";
    this.maxTokens = config.maxTokens ?? 4096;
    this.debug = config.debug ?? false;
  }

  /**
   * Execute a single API call for the given instance.
   * Processes tool calls and returns the result.
   *
   * @param charter - The charter for ref resolution and executor access
   * @param instance - The current node instance being executed
   * @param ancestors - Parent instances from root to parent (for tool context)
   * @param input - User input message (may be empty for continuation)
   * @param options - Run options including history, step limits, and debug flag
   * @returns Result containing response, updated instance, messages, and stop reason
   */
  async run(
    charter: Charter<unknown>,
    instance: Instance,
    ancestors: Instance[],
    input: string,
    options?: RunOptions<unknown>,
  ): Promise<RunResult<unknown>> {
    let currentState = instance.state;
    let currentNode = instance.node;
    let currentChildren = instance.child;
    let currentExecutorConfig = instance.executorConfig;
    const newMessages: Message[] = [];

    // Build ancestor state map for tool execution
    const ancestorStates = new Map<Instance, unknown>();
    for (const ancestor of ancestors) {
      ancestorStates.set(ancestor, ancestor.state);
    }

    // Get pack states from root instance (first ancestor or current instance)
    const rootInstance = ancestors[0] ?? instance;
    const packStates: Record<string, unknown> = { ...(rootInstance.packStates ?? {}) };

    // Build conversation history for API, including previous history
    const conversationHistory: MessageParam[] = [];

    // Add previous history if provided
    if (options?.history) {
      for (const msg of options.history) {
        conversationHistory.push(this.convertMessageToParam(msg));
      }
    }

    // Add current user input (only if non-empty)
    if (input) {
      newMessages.push(userMessage(input));
      conversationHistory.push({ role: "user", content: input });
    }

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
      options,
    );

    // Prepare Anthropic tools
    const anthropicTools = tools.map((t) => {
      // Built-in tools (like web_search) have a 'type' field but no 'input_schema'.
      // Anthropic's SDK Tool type doesn't properly model these, requiring a cast.
      if ("type" in t && !("input_schema" in t)) {
        return t as unknown as Anthropic.Messages.Tool;
      }
      // Custom tools need the standard format
      return {
        name: t.name,
        description: t.description,
        input_schema: t.input_schema as Anthropic.Messages.Tool["input_schema"],
      };
    });

    // Resolve effective executor config (instance > node > executor defaults)
    const execConfig = instance.executorConfig ?? instance.node.executorConfig ?? {};

    // Runtime validation of known executorConfig fields
    if (execConfig.model !== undefined && typeof execConfig.model !== "string") {
      throw new Error(`executorConfig.model must be a string, got ${typeof execConfig.model}`);
    }
    if (execConfig.maxTokens !== undefined && typeof execConfig.maxTokens !== "number") {
      throw new Error(`executorConfig.maxTokens must be a number, got ${typeof execConfig.maxTokens}`);
    }
    if (execConfig.temperature !== undefined && typeof execConfig.temperature !== "number") {
      throw new Error(`executorConfig.temperature must be a number, got ${typeof execConfig.temperature}`);
    }

    // Use validated values with defaults
    const effectiveModel = (execConfig.model as string | undefined) ?? this.model;
    const effectiveMaxTokens = (execConfig.maxTokens as number | undefined) ?? this.maxTokens;
    const effectiveTemperature = execConfig.temperature as number | undefined; // undefined = use API default

    // Build structured output format if node has output config (beta feature)
    let outputFormat: { type: "json_schema"; json_schema: { name: string; schema: unknown } } | undefined;
    if (currentNode.output?.schema) {
      const jsonSchema = z.toJSONSchema(currentNode.output.schema, {
        target: "openApi3",
      });
      outputFormat = {
        type: "json_schema",
        json_schema: {
          name: `${currentNode.id}_output`,
          schema: jsonSchema,
        },
      };
    }

    // Make ONE API call (use beta endpoint for structured outputs if needed)
    const apiParams = {
      model: effectiveModel,
      max_tokens: effectiveMaxTokens,
      ...(effectiveTemperature !== undefined && { temperature: effectiveTemperature }),
      system: systemPrompt,
      messages: conversationHistory,
      tools: anthropicTools,
    };

    const response = outputFormat
      ? await this.client.beta.messages.create({
          ...apiParams,
          // Type cast needed as SDK types may not match API exactly for beta features
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          output_format: outputFormat as any,
          betas: ["structured-outputs-2025-11-13"],
        })
      : await this.client.messages.create(apiParams);

    // Debug: log the response
    if (this.debug) {
      console.log(`[executor] stop_reason: ${response.stop_reason}`);
      console.log(`[executor] content:`, JSON.stringify(response.content, null, 2));
    }

    // Convert response content to our format
    // Cast needed because beta and non-beta responses have different content block types
    let assistantContent = this.convertContentBlocks(response.content as AnthropicContentBlock[]);

    // If node has structured output, transform text blocks to OutputBlocks
    if (currentNode.output?.mapTextBlock) {
      assistantContent = assistantContent.map((block) => {
        if (block.type === "text") {
          const mapped = currentNode.output!.mapTextBlock(block.text);
          return { type: "output", data: mapped } as OutputBlock<unknown>;
        }
        return block;
      });
    }

    const assistantMsg = assistantMessage(assistantContent);
    newMessages.push(assistantMsg);

    // Determine yield reason and process accordingly
    let yieldReason: "end_turn" | "tool_use" | "max_tokens" | "cede" = "end_turn";
    let cedePayload: unknown = undefined;

    if (response.stop_reason === "max_tokens") {
      yieldReason = "max_tokens";
    } else if (response.stop_reason === "tool_use") {
      // Process tool calls synchronously
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
        if (name === TOOL_UPDATE_STATE) {
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
            const packState = packStates[packName] ?? pack.initialState;

            // Execute pack tool with pack context
            try {
              const packTool = tool as { execute: (input: unknown, ctx: { state: unknown; updateState: (patch: Partial<unknown>) => void }) => Promise<unknown> | unknown };
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

          const { result: toolResultStr, isError, userMessage } = await executeTool(
            tool,
            toolInput,
            toolState,
            onUpdate,
          );
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

      // Add tool results to messages
      if (toolResults.length > 0) {
        const toolResultMsg = userMessage(toolResults);
        newMessages.push(toolResultMsg);
      }

      // Execute queued transition
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
        if (isCedeResult(result)) {
          // Cede: return with cede yield reason
          yieldReason = "cede";
          cedePayload = result.payload;
        } else if (isSpawnResult(result)) {
          // Spawn: add children to current instance
          const newChildren = result.children.map(({ node, state, executorConfig: childExecConfig }) =>
            createInstance(
              node,
              state ?? node.initialState,
              undefined, // child
              undefined, // packStates
              childExecConfig ?? node.executorConfig, // Apply config hierarchy
            ),
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
          // Return with tool_use - more work to do
          yieldReason = "tool_use";
        } else if (isTransitionToResult(result)) {
          // Normal transition
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
          // Update executor config: use transition override, or node default
          currentExecutorConfig = result.executorConfig ?? currentNode.executorConfig;
          // Clear children on transition to new node
          currentChildren = undefined;
          // Return with tool_use - more work to do on new node
          yieldReason = "tool_use";
        }
      } else {
        // Tools were called but no transition - return tool_use
        yieldReason = "tool_use";
      }
    }
    // else: end_turn - yieldReason already set to "end_turn"

    // Build updated instance
    const updatedInstance = this.buildUpdatedInstance(
      instance,
      currentNode,
      currentState,
      currentChildren,
      ancestors,
      packStates,
      currentExecutorConfig,
    );

    return {
      instance: updatedInstance,
      messages: newMessages,
      yieldReason,
      cedePayload,
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
    executorConfig?: Record<string, unknown>,
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
      executorConfig,
    };
  }

  /**
   * Build the system prompt for the current node.
   * Includes node instructions, current state, available transitions,
   * ancestor context, pack states, and step warnings.
   *
   * @param charter - The charter (unused but reserved for future extensions)
   * @param node - The current node being executed
   * @param state - Current state to display
   * @param ancestors - Parent instances for context
   * @param packStates - Current pack states
   * @param options - Run options for step warning calculation
   * @returns Complete system prompt string
   */
  protected buildSystemPrompt<S>(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    charter: Charter,
    node: Node<S>,
    state: S,
    ancestors: Instance[],
    packStates: Record<string, unknown>,
    options?: RunOptions,
  ): string {
    let prompt = `${node.instructions}

${this.buildStateSection(state)}

${this.buildTransitionsSection(node.transitions)}`;

    // Add ancestor context if any
    if (ancestors.length > 0) {
      prompt += `\n\n${this.buildAncestorContext(ancestors)}`;
    }

    // Add active packs section
    const packsSection = this.buildPacksSection(node, packStates);
    if (packsSection) {
      prompt += `\n\n${packsSection}`;
    }

    // Add step limit warning if nearing max
    const stepWarning = this.buildStepWarning(options);
    if (stepWarning) {
      prompt += `\n\n${stepWarning}`;
    }

    return prompt;
  }

  /**
   * Build a step limit warning message if nearing or at max steps.
   * Returns different urgency levels based on remaining steps.
   *
   * @param options - Run options containing currentStep and maxSteps
   * @returns Warning message or null if not near limit
   */
  protected buildStepWarning(options?: RunOptions): string | null {
    if (!options?.currentStep || !options?.maxSteps) {
      return null;
    }

    const { currentStep, maxSteps } = options;
    const remaining = maxSteps - currentStep;

    if (remaining <= 0) {
      return `⚠️ CRITICAL: This is your FINAL step. You MUST respond to the user now with whatever progress you have made. Do not use any tools.`;
    } else if (remaining === 1) {
      return `⚠️ WARNING: You have only 1 step remaining after this one. Wrap up your work and prepare to respond to the user.`;
    } else if (remaining <= 2) {
      return `⚠️ NOTICE: You have ${remaining} steps remaining. Start wrapping up your work soon.`;
    }

    return null;
  }

  /**
   * Build the active packs section of the system prompt.
   */
  protected buildPacksSection<S>(
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
  private convertMessageToParam(msg: Message<unknown>): MessageParam {
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
      // OutputBlock - convert back to text for history
      if (block.type === "output") {
        return {
          type: "text" as const,
          text: JSON.stringify(block.data, null, 2),
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
