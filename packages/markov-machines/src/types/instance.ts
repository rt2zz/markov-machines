import { v4 as uuid } from "uuid";
import type { Node } from "./node.js";
import type { StandardNodeConfig } from "../executor/types.js";
import type { SuspendResult } from "./transitions.js";

/**
 * Helper to extract state type from a Node type.
 * Constrained to Node to avoid unbounded type inference.
 */
export type NodeState<N extends Node> = N extends Node<infer S> ? S : unknown;

/**
 * Information about a suspended instance.
 */
export interface SuspendInfo {
  /** Unique ID for this suspension - must match to resume */
  suspendId: string;
  /** Human-readable reason for suspension */
  reason: string;
  /** When the instance was suspended */
  suspendedAt: Date;
  /** Optional metadata for application use */
  metadata?: Record<string, unknown>;
}

/**
 * Runtime node instance with state and optional children.
 * Forms a tree structure where nodes can spawn children.
 * @typeParam N - The node type (full Node<S> type for type inference).
 */
export interface Instance<N extends Node = Node> {
  /** Unique identifier for this instance */
  id: string;
  /** The node definition */
  node: N;
  /** Current state for this node */
  state: NodeState<N>;
  /** Optional child instance(s) - uses Instance (not Instance<any>) to avoid type explosion */
  child?: Instance | Instance[];
  /** Pack states (only on root instance, shared across all nodes) */
  packStates?: Record<string, unknown>;
  /** Effective executor config for this instance (override or from node) */
  executorConfig?: StandardNodeConfig;
  /** Suspension info - if present, instance is suspended */
  suspended?: SuspendInfo;
}

/**
 * Create a new instance with auto-generated ID.
 */
export function createInstance<N extends Node>(
  node: N,
  state: NodeState<N>,
  child?: Instance | Instance[],
  packStates?: Record<string, unknown>,
  executorConfig?: StandardNodeConfig,
): Instance<N> {
  return {
    id: uuid(),
    node,
    state,
    child,
    packStates,
    executorConfig,
  };
}

/**
 * Check if a value is an Instance.
 */
export function isInstance<N extends Node = Node>(value: unknown): value is Instance<N> {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "node" in value &&
    "state" in value
  );
}

/**
 * Check if an instance is passive.
 */
export function isPassiveInstance(instance: Instance): boolean {
  return instance.node.passive === true;
}

/**
 * Get the active instance (last deepest child).
 * When child is an array, picks the LAST element.
 */
export function getActiveInstance(instance: Instance): Instance {
  let current: Instance = instance;
  while (current.child) {
    if (Array.isArray(current.child)) {
      if (current.child.length === 0) break;
      const lastChild = current.child[current.child.length - 1];
      if (!lastChild) break;
      current = lastChild;
    } else {
      current = current.child;
    }
  }
  return current;
}

/**
 * Get all instances from root to active leaf.
 * When encountering arrays, follows the LAST child path.
 */
export function getInstancePath(instance: Instance): Instance[] {
  const path: Instance[] = [];
  let current: Instance | undefined = instance;
  while (current) {
    path.push(current);
    if (!current.child) break;
    if (Array.isArray(current.child)) {
      current =
        current.child.length > 0
          ? current.child[current.child.length - 1]
          : undefined;
    } else {
      current = current.child;
    }
  }
  return path;
}

/**
 * Get ALL instances in the tree (depth-first).
 * Traverses all children in arrays.
 * Includes cycle detection and max depth protection.
 *
 * @param instance - The root instance to start traversal from
 * @param maxDepth - Maximum depth to traverse (default 100, protects against cycles)
 * @returns Array of all instances in the tree
 * @throws Error if a cycle is detected or max depth is exceeded
 */
export function getAllInstances(instance: Instance, maxDepth = 100): Instance[] {
  const visited = new Set<string>();

  function traverse(inst: Instance, depth: number): Instance[] {
    if (depth > maxDepth) {
      throw new Error(
        `Max depth (${maxDepth}) exceeded in instance tree traversal. Possible cycle detected.`,
      );
    }

    if (visited.has(inst.id)) {
      throw new Error(
        `Cycle detected in instance tree: instance "${inst.id}" was already visited.`,
      );
    }
    visited.add(inst.id);

    const result: Instance[] = [inst];
    if (inst.child) {
      const children = Array.isArray(inst.child) ? inst.child : [inst.child];
      for (const child of children) {
        result.push(...traverse(child, depth + 1));
      }
    }
    return result;
  }

  return traverse(instance, 0);
}

/**
 * Information about an active leaf instance for parallel execution.
 */
export interface ActiveLeafInfo {
  /** Path from root to leaf (inclusive) */
  path: Instance[];
  /** Index path for tree updates (e.g., [0, 2] = root.child[0].child[2]) */
  leafIndex: number[];
  /** Whether this is a passive instance */
  isPassive: boolean;
}

/**
 * Get all active leaf instances in the tree.
 * For parallel execution, finds all leaves that should execute.
 * Suspended instances are excluded.
 *
 * @param instance - The root instance
 * @returns Array of ActiveLeafInfo for each leaf
 */
export function getActiveLeaves(instance: Instance): ActiveLeafInfo[] {
  const results: ActiveLeafInfo[] = [];

  function traverse(inst: Instance, path: Instance[], indices: number[]): void {
    const currentPath = [...path, inst];

    // Skip suspended instances
    if (inst.suspended) {
      return;
    }

    if (!inst.child) {
      // Leaf node - include it
      results.push({
        path: currentPath,
        leafIndex: indices,
        isPassive: isPassiveInstance(inst),
      });
      return;
    }

    const children = Array.isArray(inst.child) ? inst.child : [inst.child];
    children.forEach((child, i) => traverse(child, currentPath, [...indices, i]));
  }

  traverse(instance, [], []);
  return results;
}

/**
 * Check if an instance is suspended.
 */
export function isSuspendedInstance(instance: Instance): boolean {
  return instance.suspended !== undefined;
}

/**
 * Get all suspended instances in the tree.
 */
export function getSuspendedInstances(instance: Instance, maxDepth = 100): Instance[] {
  const all = getAllInstances(instance, maxDepth);
  return all.filter(inst => inst.suspended !== undefined);
}

/**
 * Find an instance by ID in the tree.
 */
export function findInstanceById(root: Instance, id: string, maxDepth = 100): Instance | undefined {
  const all = getAllInstances(root, maxDepth);
  return all.find(inst => inst.id === id);
}

/**
 * Create SuspendInfo from a SuspendResult.
 */
export function createSuspendInfo(result: SuspendResult): SuspendInfo {
  return {
    suspendId: result.suspendId,
    reason: result.reason,
    suspendedAt: new Date(),
    metadata: result.metadata,
  };
}

/**
 * Clear suspension from an instance.
 * Returns a new instance without the suspended field.
 */
export function clearSuspension(instance: Instance): Instance {
  const { suspended: _, ...rest } = instance;
  return rest as Instance;
}
