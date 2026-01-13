import type { Charter } from "../types/charter.js";
import type { NodeInstance } from "../types/instance.js";
import type { AnyToolDefinition } from "../types/tools.js";
import type { Transition } from "../types/transitions.js";
import type { Node } from "../types/node.js";
import type { Executor } from "../executor/types.js";

/**
 * Resolve a tool by name, walking up from current instance to charter.
 * Child tools override parent tools (closest match wins).
 *
 * @param charter - The charter (final fallback)
 * @param instance - Current node instance
 * @param ancestors - Parent instances from root to parent (not including current)
 * @param toolName - Name of the tool to resolve
 * @returns The tool definition and which instance owns it, or undefined if not found
 */
export function resolveTool(
  charter: Charter,
  instance: NodeInstance,
  ancestors: NodeInstance[],
  toolName: string,
): { tool: AnyToolDefinition; owner: NodeInstance | "charter" } | undefined {
  // First check current instance
  const currentTool = instance.node.tools[toolName];
  if (currentTool) {
    return { tool: currentTool, owner: instance };
  }

  // Walk up ancestors (from nearest parent to root)
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const ancestor = ancestors[i];
    if (!ancestor) continue;
    const ancestorTool = ancestor.node.tools[toolName];
    if (ancestorTool) {
      return { tool: ancestorTool, owner: ancestor };
    }
  }

  // Finally check charter
  const charterTool = charter.tools[toolName];
  if (charterTool) {
    return { tool: charterTool, owner: "charter" };
  }

  return undefined;
}

/**
 * Resolve a transition by name from the current node.
 * Transitions are scoped to own node only (no ancestor lookup).
 *
 * @param instance - Current node instance
 * @param transitionName - Name of the transition
 * @returns The transition or undefined if not found
 */
export function resolveTransition<S>(
  instance: NodeInstance<S>,
  transitionName: string,
): Transition<S> | undefined {
  return instance.node.transitions[transitionName];
}

/**
 * Resolve a node by ref from the charter.
 *
 * @param charter - The charter
 * @param ref - Node ref name
 * @returns The node or undefined if not found
 */
export function resolveNode(
  charter: Charter,
  ref: string,
): Node<unknown> | undefined {
  return charter.nodes[ref];
}

/**
 * Resolve an executor by ref from the charter.
 *
 * @param charter - The charter
 * @param ref - Executor ref name
 * @returns The executor or undefined if not found
 */
export function resolveExecutor(
  charter: Charter,
  ref: string,
): Executor | undefined {
  return charter.executors[ref];
}

/**
 * Collect all available tools for a node instance.
 * Includes tools from current node, all ancestors, and charter.
 * Child tools shadow parent tools with the same name.
 *
 * @param charter - The charter
 * @param instance - Current node instance
 * @param ancestors - Parent instances from root to parent
 * @returns Map of tool name to tool definition
 */
export function collectAvailableTools(
  charter: Charter,
  instance: NodeInstance,
  ancestors: NodeInstance[],
): Record<string, AnyToolDefinition> {
  const tools: Record<string, AnyToolDefinition> = {};

  // Start with charter tools (lowest priority)
  for (const [name, tool] of Object.entries(charter.tools)) {
    tools[name] = tool;
  }

  // Add ancestor tools (from root to nearest parent)
  for (const ancestor of ancestors) {
    for (const [name, tool] of Object.entries(ancestor.node.tools)) {
      tools[name] = tool; // Overrides charter tools
    }
  }

  // Add current instance tools (highest priority)
  for (const [name, tool] of Object.entries(instance.node.tools)) {
    tools[name] = tool; // Overrides ancestor tools
  }

  return tools;
}
