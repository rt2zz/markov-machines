import { z } from "zod";
import type { Node } from "../types/node.js";
import type { Charter } from "../types/charter.js";
import type { AnthropicToolDefinition } from "../types/tools.js";
import type { Transition } from "../types/transitions.js";
import {
  isCodeTransition,
  isGeneralTransition,
  transitionHasArguments,
} from "../types/transitions.js";
import { isRef } from "../types/refs.js";

/**
 * Generate Anthropic tool definitions for a node.
 * Includes: updateState, transition tools, and charter tools.
 */
export function generateToolDefinitions<R, S>(
  charter: Charter<R>,
  node: Node<R, S>,
): AnthropicToolDefinition[] {
  const tools: AnthropicToolDefinition[] = [];

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
  }

  // Add named transition tools
  for (const t of transitionsWithArgs) {
    tools.push({
      name: `transition_${t.name}`,
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
  }

  // 3. Add charter tools referenced by this node (root state access)
  for (const toolRef of node.charterTools) {
    const tool = charter.tools[toolRef.ref];
    if (tool) {
      const inputSchema = z.toJSONSchema(tool.inputSchema, {
        target: "openapi-3.0",
      });
      tools.push({
        name: tool.name,
        description: tool.description,
        input_schema: inputSchema as AnthropicToolDefinition["input_schema"],
      });
    }
  }

  // 4. Add inline node tools (node state access)
  for (const [name, tool] of Object.entries(node.tools)) {
    const inputSchema = z.toJSONSchema(tool.inputSchema, {
      target: "openapi-3.0",
    });
    tools.push({
      name,
      description: tool.description,
      input_schema: inputSchema as AnthropicToolDefinition["input_schema"],
    });
  }

  return tools;
}

/**
 * Resolve a transition reference to the actual transition.
 */
function resolveTransition<R, S>(
  charter: Charter<R>,
  transition: Transition<R, S>,
): Transition<R, S> {
  if (isRef(transition)) {
    const resolved = charter.transitions[transition.ref];
    if (!resolved) {
      throw new Error(`Unknown transition ref: ${transition.ref}`);
    }
    return resolved as Transition<R, S>;
  }
  return transition;
}

/**
 * Get the description for a transition.
 */
function getTransitionDescription<R, S>(transition: Transition<R, S>): string {
  if (isCodeTransition(transition)) {
    return transition.description;
  }
  if (isGeneralTransition(transition)) {
    return transition.description;
  }
  if ("description" in transition) {
    return transition.description;
  }
  return "Transition to another node";
}

/**
 * Get the arguments schema for a transition with custom args.
 */
function getTransitionArgsSchema<R, S>(
  transition: Transition<R, S>,
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
