import type { Instance, SuspendInfo } from "../types/instance.js";
import type { Node } from "../types/node.js";
import type {
  CommandContext,
  CommandResult,
  CommandExecutionResult,
} from "../types/commands.js";
import { isValueResult, isResumeResult } from "../types/commands.js";
import type { SpawnTarget, SpawnOptions } from "../types/transitions.js";
import {
  isTransitionToResult,
  isSpawnResult,
  isCedeResult,
  isSuspendResult,
} from "../types/transitions.js";
import { cede, spawn, suspend } from "../helpers/cede-spawn.js";
import { deepMerge } from "../types/state.js";
import { createInstance } from "../types/instance.js";

/**
 * Execute a command on an instance.
 * Returns the result and the updated instance.
 */
export async function executeCommand(
  instance: Instance,
  commandName: string,
  input: unknown,
): Promise<{
  result: CommandExecutionResult;
  instance: Instance;
  transitionResult?: CommandResult;
  suspendInfo?: SuspendInfo;
}> {
  const command = instance.node.commands?.[commandName];
  if (!command) {
    return {
      result: { success: false, error: `Command not found: ${commandName}` },
      instance,
    };
  }

  // Validate input
  const parsed = command.inputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      result: { success: false, error: `Invalid input: ${parsed.error.message}` },
      instance,
    };
  }

  // Track state updates
  let currentState = instance.state;
  const updateState = (patch: Partial<unknown>) => {
    currentState = deepMerge(
      currentState as Record<string, unknown>,
      patch as Record<string, unknown>,
    );
  };

  // Create context with helpers
  const ctx: CommandContext<unknown> = {
    state: currentState,
    updateState,
    cede,
    spawn,
    suspend,
  };

  try {
    // Execute the command
    const cmdResult = await command.execute(parsed.data, ctx);

    // Handle value result - just state update + value return
    if (isValueResult(cmdResult)) {
      const updatedInstance: Instance = { ...instance, state: currentState };
      return {
        result: { success: true, value: cmdResult.value },
        instance: updatedInstance,
      };
    }

    // Handle transition result
    if (isTransitionToResult(cmdResult)) {
      const newNode = cmdResult.node;
      const newState = cmdResult.state ?? newNode.initialState;
      const newInstance = createInstance(
        newNode,
        newState,
        undefined,
        instance.packStates,
        cmdResult.executorConfig,
      );
      return {
        result: { success: true },
        instance: newInstance,
        transitionResult: cmdResult,
      };
    }

    // Handle spawn result
    if (isSpawnResult(cmdResult)) {
      const children = cmdResult.children.map((target) =>
        createInstance(
          target.node,
          target.state ?? target.node.initialState,
          undefined,
          undefined,
          target.executorConfig,
        ),
      );
      const updatedInstance: Instance = {
        ...instance,
        state: currentState,
        child: children.length === 1 ? children[0] : children,
      };
      return {
        result: { success: true },
        instance: updatedInstance,
        transitionResult: cmdResult,
      };
    }

    // Handle cede result
    if (isCedeResult(cmdResult)) {
      // Return the cede result - caller must handle removing this instance
      return {
        result: { success: true, value: cmdResult.content },
        instance: { ...instance, state: currentState },
        transitionResult: cmdResult,
      };
    }

    // Handle suspend result
    if (isSuspendResult(cmdResult)) {
      const suspendInfo: SuspendInfo = {
        suspendId: cmdResult.suspendId,
        reason: cmdResult.reason,
        suspendedAt: new Date(),
        metadata: cmdResult.metadata,
      };
      const updatedInstance: Instance = {
        ...instance,
        state: currentState,
        suspended: suspendInfo,
      };
      return {
        result: { success: true },
        instance: updatedInstance,
        transitionResult: cmdResult,
        suspendInfo,
      };
    }

    // Handle resume result
    if (isResumeResult(cmdResult)) {
      // Clear the suspended field
      const { suspended: _, ...rest } = instance;
      const updatedInstance: Instance = {
        ...rest,
        state: currentState,
      };
      return {
        result: { success: true },
        instance: updatedInstance,
        transitionResult: cmdResult,
      };
    }

    return {
      result: { success: false, error: "Unknown command result type" },
      instance,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      result: { success: false, error: message },
      instance,
    };
  }
}
