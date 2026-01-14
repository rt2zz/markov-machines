import type { Charter } from "../types/charter.js";
import type { Instance } from "../types/instance.js";
import type { AnyToolDefinition } from "../types/tools.js";
import type { Transition } from "../types/transitions.js";
import type { AnyPackToolDefinition } from "../types/pack.js";

/**
 * Result of resolving a tool - includes the tool and its owner.
 */
export type ResolvedTool =
  | { tool: AnyToolDefinition; owner: Instance | "charter" }
  | { tool: AnyPackToolDefinition; owner: { pack: string } };

/**
 * Resolve a tool by name, walking up from current instance to charter to packs.
 * Priority: node > ancestors > charter > packs (for packs referenced by current node).
 *
 * @param charter - The charter (final fallback before packs)
 * @param instance - Current node instance
 * @param ancestors - Parent instances from root to parent (not including current)
 * @param toolName - Name of the tool to resolve
 * @returns The tool definition and which instance owns it, or undefined if not found
 */
export function resolveTool(
  charter: Charter,
  instance: Instance,
  ancestors: Instance[],
  toolName: string,
): ResolvedTool | undefined {
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

  // Check charter tools
  const charterTool = charter.tools[toolName];
  if (charterTool) {
    return { tool: charterTool, owner: "charter" };
  }

  // Finally check pack tools (for packs on current node)
  for (const pack of instance.node.packs ?? []) {
    const packTool = pack.tools[toolName];
    if (packTool) {
      return { tool: packTool, owner: { pack: pack.name } };
    }
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
  instance: Instance<S>,
  transitionName: string,
): Transition<S> | undefined {
  return instance.node.transitions[transitionName];
}

