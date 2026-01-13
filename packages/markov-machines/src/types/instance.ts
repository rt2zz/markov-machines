import type { Node } from "./node.js";

/**
 * Runtime node instance with state and optional child.
 * Forms a tree structure where vessels can have children.
 */
export interface NodeInstance<S = unknown> {
  /** The node definition */
  node: Node<S>;
  /** Current state for this node */
  state: S;
  /** Optional child instance (for vessel nodes) */
  child?: NodeInstance<unknown>;
}

/**
 * Check if a value is a NodeInstance.
 */
export function isNodeInstance(value: unknown): value is NodeInstance {
  return (
    typeof value === "object" &&
    value !== null &&
    "node" in value &&
    "state" in value
  );
}

/**
 * Get the leaf instance in the tree (the deepest child).
 */
export function getLeafInstance(instance: NodeInstance): NodeInstance {
  let current = instance;
  while (current.child) {
    current = current.child;
  }
  return current;
}

/**
 * Get all instances from root to leaf as an array.
 */
export function getInstancePath(instance: NodeInstance): NodeInstance[] {
  const path: NodeInstance[] = [];
  let current: NodeInstance | undefined = instance;
  while (current) {
    path.push(current);
    current = current.child;
  }
  return path;
}
