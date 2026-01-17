import type { Instance } from "../types/instance.js";
import type { Node } from "../types/node.js";
import type {
  CommandContext,
  CommandResult,
  CommandExecutionResult,
} from "../types/commands.js";
import { isValueResult } from "../types/commands.js";
import type {
  SpawnTarget,
  SpawnOptions,
  CedeResult,
  SpawnResult,
} from "../types/transitions.js";
import {
  isTransitionToResult,
  isSpawnResult,
  isCedeResult,
} from "../types/transitions.js";
import { deepMerge } from "../types/state.js";
import { createInstance } from "../types/instance.js";

/**
 * Execute a command on an instance.
 * Returns the result and the updated instance.
 */
export async function executeCommand<S>(
  instance: Instance<S>,
  commandName: string,
  input: unknown,
): Promise<{
  result: CommandExecutionResult;
  instance: Instance<S>;
  transitionResult?: CommandResult;
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
  const updateState = (patch: Partial<S>) => {
    currentState = deepMerge(
      currentState as Record<string, unknown>,
      patch as Record<string, unknown>,
    ) as S;
  };

  // Create context with helpers
  const ctx: CommandContext<S> = {
    state: currentState,
    updateState,
    cede: <P = unknown>(payload?: P): CedeResult<P> => ({
      type: "cede",
      payload,
    }),
    spawn: <T = unknown>(
      nodeOrTargets: Node<T> | SpawnTarget<T>[],
      state?: T,
      options?: SpawnOptions,
    ): SpawnResult<T> => {
      const children: SpawnTarget<T>[] = Array.isArray(nodeOrTargets)
        ? nodeOrTargets
        : [{ node: nodeOrTargets, state, executorConfig: options?.executorConfig }];
      return {
        type: "spawn",
        children,
      };
    },
  };

  try {
    // Execute the command
    const cmdResult = await command.execute(parsed.data, ctx);

    // Handle value result - just state update + value return
    if (isValueResult(cmdResult)) {
      const updatedInstance: Instance<S> = { ...instance, state: currentState };
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
        instance: newInstance as Instance<S>,
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
      const updatedInstance: Instance<S> = {
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
        result: { success: true, value: cmdResult.payload },
        instance: { ...instance, state: currentState },
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
