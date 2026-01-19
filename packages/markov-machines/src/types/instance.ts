import { v4 as uuid } from "uuid";
import type { Node } from "./node.js";
import type { StandardNodeConfig } from "../executor/types.js";

/**
 * Helper to extract state type from a Node type.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NodeState<N> = N extends Node<infer S> ? S : unknown;

/**
 * Runtime node instance with state and optional children.
 * Forms a tree structure where nodes can spawn children.
 * @typeParam N - The node type (full Node<S> type for type inference).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface Instance<N extends Node<any> = Node> {
  /** Unique identifier for this instance */
  id: string;
  /** The node definition */
  node: N;
  /** Current state for this node */
  state: NodeState<N>;
  /** Optional child instance(s) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  child?: Instance<any> | Instance<any>[];
  /** Pack states (only on root instance, shared across all nodes) */
  packStates?: Record<string, unknown>;
  /** Effective executor config for this instance (override or from node) */
  executorConfig?: StandardNodeConfig;
}

/**
 * Create a new instance with auto-generated ID.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createInstance<N extends Node<any>>(
  node: N,
  state: NodeState<N>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  child?: Instance<any> | Instance<any>[],
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isInstance<N extends Node<any> = Node>(value: unknown): value is Instance<N> {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "node" in value &&
    "state" in value
  );
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
