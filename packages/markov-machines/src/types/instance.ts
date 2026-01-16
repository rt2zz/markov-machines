import { v4 as uuid } from "uuid";
import type { Node } from "./node.js";

/**
 * Runtime node instance with state and optional children.
 * Forms a tree structure where nodes can spawn children.
 * @typeParam S - The node's state type.
 */
export interface Instance<S = unknown> {
  /** Unique identifier for this instance */
  id: string;
  /** The node definition */
  node: Node<S>;
  /** Current state for this node */
  state: S;
  /** Optional child instance(s) */
  child?: Instance | Instance[];
  /** Pack states (only on root instance, shared across all nodes) */
  packStates?: Record<string, unknown>;
  /** Effective executor config for this instance (override or from node) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  executorConfig?: Record<string, any>;
}

/**
 * Create a new instance with auto-generated ID.
 */
export function createInstance<S>(
  node: Node<S>,
  state: S,
  child?: Instance | Instance[],
  packStates?: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  executorConfig?: Record<string, any>,
): Instance<S> {
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
export function isInstance<S = unknown>(value: unknown): value is Instance<S> {
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
 */
export function getAllInstances(instance: Instance): Instance[] {
  const result: Instance[] = [instance];
  if (instance.child) {
    const children = Array.isArray(instance.child)
      ? instance.child
      : [instance.child];
    for (const child of children) {
      result.push(...getAllInstances(child));
    }
  }
  return result;
}
