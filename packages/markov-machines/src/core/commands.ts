import type { z } from "zod";
import type { Machine } from "../types/machine.js";
import type { Instance } from "../types/instance.js";
import type {
  CommandInfo,
  CommandExecutionResult,
  CommandContext,
  CommandResult,
} from "../types/commands.js";
import { getActiveInstance, findInstanceById } from "../types/instance.js";
import { executeCommand as executeCommandOnInstance } from "../runtime/command-executor.js";
import { isCedeResult, isSuspendResult } from "../types/transitions.js";
import { isResumeResult } from "../types/commands.js";

/**
 * Get available commands on the current active instance.
 */
export function getAvailableCommands(machine: Machine): CommandInfo[] {
  const active = getActiveInstance(machine.instance);
  const commands = active.node.commands ?? {};

  return Object.entries(commands).map(([name, cmd]) => ({
    name,
    description: cmd.description,
    inputSchema: cmd.inputSchema,
  }));
}

/**
 * Execute a command on an instance.
 * If instanceId is provided, targets that specific instance (can be suspended).
 * Otherwise, targets the current active instance.
 * Returns the updated machine and the command result.
 */
export async function runCommand(
  machine: Machine,
  commandName: string,
  input: unknown = {},
  instanceId?: string,
): Promise<{ machine: Machine; result: CommandExecutionResult }> {
  // Find the target instance
  let target: Instance;
  if (instanceId) {
    const found = findInstanceById(machine.instance, instanceId);
    if (!found) {
      return {
        machine,
        result: { success: false, error: `Instance not found: ${instanceId}` },
      };
    }
    target = found;
  } else {
    target = getActiveInstance(machine.instance);
  }

  const { result, instance: updatedInstance, transitionResult } =
    await executeCommandOnInstance(target, commandName, input);

  if (!result.success) {
    return { machine, result };
  }

  // Handle cede - need to remove the target instance from the tree
  if (transitionResult && isCedeResult(transitionResult)) {
    const updatedRoot = removeActiveInstance(machine.instance, target.id);
    if (!updatedRoot) {
      // Root instance ceded - this is an error state
      return {
        machine,
        result: { success: false, error: "Cannot cede from root instance" },
      };
    }
    return {
      machine: { ...machine, instance: updatedRoot },
      result,
    };
  }

  // Handle suspend - instance is updated with suspended field
  if (transitionResult && isSuspendResult(transitionResult)) {
    const updatedRoot = replaceInstance(machine.instance, target.id, updatedInstance);
    return {
      machine: { ...machine, instance: updatedRoot },
      result,
    };
  }

  // Handle resume - suspended field is cleared
  if (transitionResult && isResumeResult(transitionResult)) {
    const updatedRoot = replaceInstance(machine.instance, target.id, updatedInstance);
    return {
      machine: { ...machine, instance: updatedRoot },
      result,
    };
  }

  // Replace target instance in tree with updated one
  const updatedRoot = replaceInstance(machine.instance, target.id, updatedInstance);

  return {
    machine: { ...machine, instance: updatedRoot },
    result,
  };
}

/**
 * Replace an instance in the tree by ID.
 */
function replaceInstance(
  root: Instance,
  targetId: string,
  replacement: Instance,
): Instance {
  if (root.id === targetId) {
    return replacement;
  }

  if (!root.child) {
    return root;
  }

  if (Array.isArray(root.child)) {
    return {
      ...root,
      child: root.child.map((child) =>
        replaceInstance(child, targetId, replacement),
      ),
    };
  }

  return {
    ...root,
    child: replaceInstance(root.child, targetId, replacement),
  };
}

/**
 * Remove an instance from the tree by ID.
 * Returns undefined if the root itself is removed.
 */
function removeActiveInstance(
  root: Instance,
  targetId: string,
): Instance | undefined {
  if (root.id === targetId) {
    return undefined;
  }

  if (!root.child) {
    return root;
  }

  if (Array.isArray(root.child)) {
    const filtered = root.child
      .map((child) => removeActiveInstance(child, targetId))
      .filter((c): c is Instance => c !== undefined);

    if (filtered.length === 0) {
      return { ...root, child: undefined };
    }
    if (filtered.length === 1) {
      return { ...root, child: filtered[0] };
    }
    return { ...root, child: filtered };
  }

  const updatedChild = removeActiveInstance(root.child, targetId);
  return { ...root, child: updatedChild };
}

/**
 * Configuration for creating a command.
 * S is the node state type.
 */
export interface CommandConfig<TInput, TOutput, S> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  execute: (
    input: TInput,
    ctx: CommandContext<S>,
  ) => Promise<CommandResult<TOutput>> | CommandResult<TOutput>;
}

/**
 * Create a command definition.
 * Helper function for type inference.
 */
export function createCommand<TInput, TOutput, S>(
  config: CommandConfig<TInput, TOutput, S>,
): CommandConfig<TInput, TOutput, S> {
  return config;
}
