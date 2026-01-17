import type { z } from "zod";
import type { Machine } from "../types/machine.js";
import type { Instance } from "../types/instance.js";
import type {
  CommandInfo,
  CommandExecutionResult,
  CommandContext,
  CommandResult,
} from "../types/commands.js";
import { getActiveInstance } from "../types/instance.js";
import { executeCommand as executeCommandOnInstance } from "../runtime/command-executor.js";
import { isCedeResult } from "../types/transitions.js";

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
 * Execute a command on the current active instance.
 * Returns the updated machine and the command result.
 */
export async function runCommand(
  machine: Machine,
  commandName: string,
  input: unknown = {},
): Promise<{ machine: Machine; result: CommandExecutionResult }> {
  const active = getActiveInstance(machine.instance);

  const { result, instance: updatedInstance, transitionResult } =
    await executeCommandOnInstance(active, commandName, input);

  if (!result.success) {
    return { machine, result };
  }

  // Handle cede - need to remove the active instance from the tree
  if (transitionResult && isCedeResult(transitionResult)) {
    const updatedRoot = removeActiveInstance(machine.instance, active.id);
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

  // Replace active instance in tree with updated one
  const updatedRoot = replaceInstance(machine.instance, active.id, updatedInstance);

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
