import { z } from "zod";
import type { Node } from "../types/node.js";
import type { Charter } from "../types/charter.js";
import type { AnthropicToolDefinition } from "../types/tools.js";
import { isAnthropicBuiltinTool } from "../types/tools.js";
import type { Transition } from "../types/transitions.js";
import {
  isCodeTransition,
  isGeneralTransition,
  transitionHasArguments,
} from "../types/transitions.js";
import { isRef } from "../types/refs.js";

/**
 * Generate Anthropic tool definitions for a node.
 * Includes: updateState, transition tools, current node tools, ancestor tools, and charter tools.
 * Child tools shadow parent tools (closest match wins).
 */
export function generateToolDefinitions<S>(
  charter: Charter,
  node: Node<S>,
  ancestorNodes: Node<unknown>[] = [],
): AnthropicToolDefinition[] {
  const tools: AnthropicToolDefinition[] = [];
  const seenNames = new Set<string>();

  // 1. Add updateState tool
  const stateSchema = z.toJSONSchema(node.validator, { target: "openapi-3.0" });
  tools.push({
    name: "updateState",
    description:
      "Update the current state with a partial patch. The patch will be deep-merged with the current state.",
    input_schema: {
      type: "object",
      properties: {
        patch: stateSchema as Record<string, unknown>,
      },
      required: ["patch"],
    },
  });
  seenNames.add("updateState");

  // 2. Add transition tools
  const transitionsWithoutArgs: string[] = [];
  const transitionsWithArgs: Array<{
    name: string;
    description: string;
    argsSchema: Record<string, unknown>;
  }> = [];

  for (const [name, transition] of Object.entries(node.transitions)) {
    const resolved = resolveTransition(charter, transition);
    const hasArgs = transitionHasArguments(resolved);

    if (hasArgs) {
      // Named transition tool
      const argsSchema = getTransitionArgsSchema(resolved);
      transitionsWithArgs.push({
        name,
        description: getTransitionDescription(resolved),
        argsSchema,
      });
    } else {
      transitionsWithoutArgs.push(name);
    }
  }

  // Add default transition tool if there are transitions without args
  if (transitionsWithoutArgs.length > 0) {
    tools.push({
      name: "transition",
      description:
        "Transition to a different node. Use this when the current task is complete or you need different capabilities.",
      input_schema: {
        type: "object",
        properties: {
          to: {
            type: "string",
            enum: transitionsWithoutArgs,
            description: "The name of the transition to take",
          },
          reason: {
            type: "string",
            description: "Why you are making this transition",
          },
        },
        required: ["to", "reason"],
      },
    });
    seenNames.add("transition");
  }

  // Add named transition tools
  for (const t of transitionsWithArgs) {
    const toolName = `transition_${t.name}`;
    tools.push({
      name: toolName,
      description: t.description,
      input_schema: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            description: "Why you are making this transition",
          },
          ...t.argsSchema,
        },
        required: ["reason", ...Object.keys(t.argsSchema)],
      },
    });
    seenNames.add(toolName);
  }

  // 3. Add current node's tools (highest priority - added first to seenNames)
  for (const [name, tool] of Object.entries(node.tools)) {
    if (seenNames.has(name)) continue;

    // Handle Anthropic built-in tools (server-side)
    if (isAnthropicBuiltinTool(tool)) {
      tools.push({ type: tool.builtinType } as unknown as AnthropicToolDefinition);
      seenNames.add(name);
      continue;
    }

    const inputSchema = z.toJSONSchema(tool.inputSchema, {
      target: "openapi-3.0",
    });
    tools.push({
      name,
      description: tool.description,
      input_schema: inputSchema as AnthropicToolDefinition["input_schema"],
    });
    seenNames.add(name);
  }

  // 4. Add ancestor tools (from nearest to farthest)
  // Reverse so nearest ancestors are processed first
  for (let i = ancestorNodes.length - 1; i >= 0; i--) {
    const ancestorNode = ancestorNodes[i];
    if (!ancestorNode) continue;
    for (const [name, tool] of Object.entries(ancestorNode.tools)) {
      if (seenNames.has(name)) continue; // Child already has this tool
      const inputSchema = z.toJSONSchema(tool.inputSchema, {
        target: "openapi-3.0",
      });
      tools.push({
        name,
        description: tool.description,
        input_schema: inputSchema as AnthropicToolDefinition["input_schema"],
      });
      seenNames.add(name);
    }
  }

  // 5. Add charter tools
  for (const [name, tool] of Object.entries(charter.tools)) {
    if (seenNames.has(name)) continue; // Node/ancestor already has this tool
    const inputSchema = z.toJSONSchema(tool.inputSchema, {
      target: "openapi-3.0",
    });
    tools.push({
      name,
      description: tool.description,
      input_schema: inputSchema as AnthropicToolDefinition["input_schema"],
    });
    seenNames.add(name);
  }

  // 6. Add pack tools (lowest priority - only for packs on current node)
  for (const pack of node.packs ?? []) {
    for (const [name, tool] of Object.entries(pack.tools)) {
      if (seenNames.has(name)) continue; // Higher priority tool already exists
      const inputSchema = z.toJSONSchema(tool.inputSchema, {
        target: "openapi-3.0",
      });
      tools.push({
        name,
        description: tool.description,
        input_schema: inputSchema as AnthropicToolDefinition["input_schema"],
      });
      seenNames.add(name);
    }
  }

  return tools;
}

/**
 * Resolve a transition reference to the actual transition.
 */
function resolveTransition<S>(
  charter: Charter,
  transition: Transition<S>,
): Transition<S> {
  if (isRef(transition)) {
    const resolved = charter.transitions[transition.ref];
    if (!resolved) {
      throw new Error(`Unknown transition ref: ${transition.ref}`);
    }
    return resolved as Transition<S>;
  }
  return transition;
}

/**
 * Get the description for a transition.
 */
function getTransitionDescription<S>(transition: Transition<S>): string {
  if ("description" in transition && typeof transition.description === "string") {
    return transition.description;
  }
  return "Transition to another node";
}

/**
 * Get the arguments schema for a transition with custom args.
 */
function getTransitionArgsSchema<S>(
  transition: Transition<S>,
): Record<string, unknown> {
  if (isCodeTransition(transition) && transition.arguments) {
    const schema = z.toJSONSchema(transition.arguments, { target: "openapi-3.0" });
    // Extract just the properties
    if (typeof schema === "object" && "properties" in schema) {
      return (schema as { properties: Record<string, unknown> }).properties;
    }
    return { args: schema };
  }

  if (isGeneralTransition(transition)) {
    // General transition takes an inline node definition
    return {
      node: {
        type: "object",
        description: "Inline node definition",
        properties: {
          instructions: {
            type: "string",
            description: "Instructions for the agent in this node",
          },
          tools: {
            type: "array",
            items: {
              type: "object",
              properties: {
                ref: { type: "string" },
              },
              required: ["ref"],
            },
            description: "Tool references available in this node",
          },
          validator: {
            type: "object",
            description: "Zodex-serialized state schema",
          },
          transitions: {
            type: "object",
            description: "Available transitions from this node",
          },
        },
        required: ["instructions", "tools", "validator", "transitions"],
      },
    };
  }

  if ("arguments" in transition && transition.arguments) {
    // SerialTransition with JSON Schema arguments
    return { args: transition.arguments };
  }

  return {};
}
