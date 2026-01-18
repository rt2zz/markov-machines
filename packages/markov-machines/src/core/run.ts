import type { Machine } from "../types/machine.js";
import type { RunOptions, MachineStep } from "../executor/types.js";
import type { Instance } from "../types/instance.js";
import type { Command } from "../types/commands.js";
import type { Message } from "../types/messages.js";
import { getInstancePath } from "../types/instance.js";
import { userMessage } from "../types/messages.js";
import { isCommand } from "../types/commands.js";
import { runCommand } from "./commands.js";

/**
 * Input type for runMachine.
 * Can be a string (user message) or a Command object.
 */
export type RunMachineInput = string | Command;

/** Check if packStates has any entries */
const hasPackStates = (ps?: Record<string, unknown>): boolean =>
  ps !== undefined && Object.keys(ps).length > 0;

/**
 * Rebuild the tree by replacing the active instance.
 * Follows the same path that getInstancePath would follow.
 */
function rebuildTree(
  updatedActive: Instance,
  ancestors: Instance[],
  packStates?: Record<string, unknown>,
): Instance {
  // If no ancestors, the root IS the active instance
  if (ancestors.length === 0) {
    // Apply packStates directly to root if provided
    if (hasPackStates(packStates)) {
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
        ...(isRoot && hasPackStates(packStates) ? { packStates } : {}),
      };
    } else {
      // For single child, just replace
      current = {
        id: ancestor.id,
        node: ancestor.node,
        state: ancestor.state,
        child: current,
        // Apply packStates to root instance only
        ...(isRoot && hasPackStates(packStates) ? { packStates } : {}),
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
    if (hasPackStates(packStates)) {
      return { ...updatedParent, packStates };
    }
    return updatedParent;
  }

  // Otherwise, rebuild the tree with the updated parent
  const remainingAncestors = ancestors.slice(0, -1);
  return rebuildTree(updatedParent, remainingAncestors, packStates);
}

/**
 * Run the machine with user input or command.
 * Yields MachineStep for each inference call or command execution.
 * Continues until there's a text response or max steps exceeded.
 *
 * When input is a Command:
 * - Execute command via runCommand()
 * - Yield step with yieldReason "command"
 * - Return immediately (caller handles any cascade)
 *
 * @typeParam AppMessage - The application message type for structured outputs (defaults to unknown).
 */
export async function* runMachine<AppMessage = unknown>(
  machine: Machine<AppMessage>,
  input: RunMachineInput,
  options?: RunOptions<AppMessage>,
): AsyncGenerator<MachineStep<AppMessage>> {
  // Handle Command input
  if (isCommand(input)) {
    const { machine: updatedMachine, result } = await runCommand(
      machine,
      input.name,
      input.input,
    );

    // Create a message for history tracking
    const commandMessage = result.success
      ? `[Command: ${input.name} executed]`
      : `[Command: ${input.name} failed - ${result.error}]`;

    yield {
      instance: updatedMachine.instance,
      messages: [userMessage(commandMessage)],
      yieldReason: "command",
      done: true,
    };
    return;
  }

  // String input - normal execution
  let currentInstance = machine.instance;
  let currentInput = input;

  // Base history from before this run
  const baseHistory: Message<AppMessage>[] = machine.history ?? [];
  let currentHistory: Message<AppMessage>[] = baseHistory;

  const maxSteps = options?.maxSteps ?? 50;
  let steps = 0;
  let tokenRecoveryAttempted = false;

  while (steps < maxSteps) {
    steps++;

    // Get the active instance path (root -> active leaf)
    const activePath = getInstancePath(currentInstance);
    const activeInstance = activePath[activePath.length - 1];
    const ancestors = activePath.slice(0, -1);

    if (!activeInstance) {
      throw new Error("No active instance found");
    }

    if (options?.debug) {
      const instructions = activeInstance.node.instructions;
      console.log(`[runMachine] Step ${steps}/${maxSteps}`);
      console.log(`[runMachine]   Active node: ${instructions.slice(0, 50)}${instructions.length > 50 ? '...' : ''}`);
      console.log(`[runMachine]   Ancestors: ${ancestors.length}`);
      console.log(`[runMachine]   Input: "${currentInput.slice(0, 50)}${currentInput.length > 50 ? '...' : ''}"`);
    }

    // Run the executor (ONE API call)
    const result = await machine.charter.executor.run(
      machine.charter,
      activeInstance,
      ancestors,
      currentInput,
      { ...options, history: currentHistory, currentStep: steps, maxSteps },
    );

    if (options?.debug) {
      console.log(`[runMachine]   Result yieldReason: ${result.yieldReason}`);
      console.log(`[runMachine]   Result messages: ${result.messages.length}`);
    }

    // Handle cede: rebuild tree without the ceded child
    if (result.yieldReason === "cede") {
      currentInstance = rebuildTreeAfterCede(ancestors, result.packStates);

      // Yield cede step (never final - parent needs to respond)
      yield {
        instance: currentInstance,
        messages: result.messages,
        yieldReason: "cede",
        done: false,
        cedePayload: result.cedePayload,
      };

      // Prepare for parent's turn with cede payload
      if (result.cedePayload) {
        const cedeMessage = userMessage<AppMessage>(
          `[Child completed: ${JSON.stringify(result.cedePayload)}]`
        );
        currentHistory = [...baseHistory, cedeMessage];
      } else {
        currentHistory = baseHistory;
      }
      currentInput = "";
      continue;
    }

    // Normal case: rebuild tree with updated instance
    currentInstance = rebuildTree(result.instance, ancestors, result.packStates);

    // Handle max_tokens: give LLM one recovery chance
    if (result.yieldReason === "max_tokens" && !tokenRecoveryAttempted) {
      tokenRecoveryAttempted = true;
      if (options?.debug) {
        console.log(`[runMachine] max_tokens hit, attempting recovery...`);
      }

      // Yield the partial step (not final)
      yield {
        instance: currentInstance,
        messages: result.messages,
        yieldReason: result.yieldReason,
        done: false,
      };

      // Add recovery message and continue
      const recoveryMessage = userMessage<AppMessage>(
        `[System: Your response was cut off due to length limits. Please provide a brief summary of your findings and respond to the user now. Do not use any tools - just give your final answer.]`
      );
      currentHistory = [...currentHistory, ...(result.messages as Message<AppMessage>[]), recoveryMessage];
      currentInput = "";
      continue;
    }

    // Determine if this is the final step
    // end_turn is always final (LLM chose to stop)
    // max_tokens after recovery is final (we tried our best)
    const isFinal = result.yieldReason === "end_turn" ||
                    result.yieldReason === "max_tokens";

    yield {
      instance: currentInstance,
      messages: result.messages,
      yieldReason: result.yieldReason,
      done: isFinal,
    };

    if (isFinal) {
      return;
    }

    // Not final - continue to next step
    // Accumulate messages so Claude sees tool calls and results
    currentHistory = [...currentHistory, ...(result.messages as Message<AppMessage>[])];
    currentInput = "";
  }

  throw new Error(`Max steps (${maxSteps}) exceeded`);
}

/**
 * Run the machine to completion, returning only the final step.
 * Convenience wrapper for cases that don't need step-by-step control.
 *
 * @typeParam AppMessage - The application message type for structured outputs (defaults to unknown).
 */
export async function runMachineToCompletion<AppMessage = unknown>(
  machine: Machine<AppMessage>,
  input: RunMachineInput,
  options?: RunOptions<AppMessage>,
): Promise<MachineStep<AppMessage>> {
  let lastStep: MachineStep<AppMessage> | null = null;
  for await (const step of runMachine(machine, input, options)) {
    lastStep = step;
  }
  if (!lastStep) {
    throw new Error("No steps produced");
  }
  return lastStep;
}
