import type { Machine } from "../types/machine.js";
import type { RunOptions, RunResult } from "../executor/types.js";
import type { Instance } from "../types/instance.js";
import { getInstancePath } from "../types/instance.js";

/**
 * Rebuild the tree by replacing the active instance.
 * Follows the same path that getInstancePath would follow.
 */
function rebuildTree(
  root: Instance,
  updatedActive: Instance,
  ancestors: Instance[],
  packStates?: Record<string, unknown>,
): Instance {
  // If no ancestors, the root IS the active instance
  if (ancestors.length === 0) {
    // Apply packStates directly to root if provided
    if (packStates && Object.keys(packStates).length > 0) {
      return { ...updatedActive, packStates };
    }
    return updatedActive;
  }

  // Build from bottom up
  let current: Instance = updatedActive;
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const ancestor = ancestors[i];
    if (!ancestor) continue;

    const isRoot = i === 0;

    // Clone the ancestor and update its child
    if (Array.isArray(ancestor.child)) {
      // For array children, replace the last element
      const newChildren = [...ancestor.child];
      newChildren[newChildren.length - 1] = current;
      current = {
        id: ancestor.id,
        node: ancestor.node,
        state: ancestor.state,
        child: newChildren,
        // Apply packStates to root instance only
        ...(isRoot && packStates && Object.keys(packStates).length > 0 ? { packStates } : {}),
      };
    } else {
      // For single child, just replace
      current = {
        id: ancestor.id,
        node: ancestor.node,
        state: ancestor.state,
        child: current,
        // Apply packStates to root instance only
        ...(isRoot && packStates && Object.keys(packStates).length > 0 ? { packStates } : {}),
      };
    }
  }

  return current;
}

/**
 * Rebuild the tree after a cede, removing the ceded child.
 * The parent becomes the new active instance.
 */
function rebuildTreeAfterCede(
  root: Instance,
  ancestors: Instance[],
  packStates?: Record<string, unknown>,
): Instance {
  // If no ancestors, the root itself ceded - this shouldn't happen
  // since root has no parent to cede to
  if (ancestors.length === 0) {
    throw new Error("Root instance cannot cede - no parent to return to");
  }

  // The direct parent of the ceded child
  const directParent = ancestors[ancestors.length - 1];
  if (!directParent) {
    throw new Error("No direct parent found for cede");
  }

  // Remove the ceded child from the direct parent
  let updatedParent: Instance;
  if (Array.isArray(directParent.child)) {
    // For array children, remove the last element (the ceded child)
    const newChildren = directParent.child.slice(0, -1);
    updatedParent = {
      id: directParent.id,
      node: directParent.node,
      state: directParent.state,
      child: newChildren.length === 0 ? undefined : newChildren.length === 1 ? newChildren[0] : newChildren,
    };
  } else {
    // For single child, remove it entirely
    updatedParent = {
      id: directParent.id,
      node: directParent.node,
      state: directParent.state,
      child: undefined,
    };
  }

  // If there's only one ancestor (the direct parent), it becomes the root
  if (ancestors.length === 1) {
    if (packStates && Object.keys(packStates).length > 0) {
      return { ...updatedParent, packStates };
    }
    return updatedParent;
  }

  // Otherwise, rebuild the tree with the updated parent
  const remainingAncestors = ancestors.slice(0, -1);
  return rebuildTree(root, updatedParent, remainingAncestors, packStates);
}

/**
 * Run the machine with user input.
 * Finds the active (deepest) instance and runs it.
 */
export async function runMachine(
  machine: Machine,
  input: string,
  options?: RunOptions,
): Promise<RunResult> {
  // Get the active instance path (root -> active leaf)
  const activePath = getInstancePath(machine.instance);
  const activeInstance = activePath[activePath.length - 1];
  const ancestors = activePath.slice(0, -1);

  if (!activeInstance) {
    throw new Error("No active instance found");
  }

  // Run the active instance with history
  const result = await machine.charter.executor.run(
    machine.charter,
    activeInstance,
    ancestors,
    input,
    { ...options, history: machine.history },
  );

  // Handle cede: remove the ceded child from the tree
  if (result.stopReason === "cede") {
    const updatedRoot = rebuildTreeAfterCede(machine.instance, ancestors, result.packStates);
    return {
      ...result,
      instance: updatedRoot,
    };
  }

  // Normal case: rebuild the full tree with the updated active instance
  const updatedRoot = rebuildTree(machine.instance, result.instance, ancestors, result.packStates);

  return {
    ...result,
    instance: updatedRoot,
  };
}
