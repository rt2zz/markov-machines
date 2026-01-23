"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import {
  runCommand,
  createMachine,
  serializeInstance,
  deserializeInstance,
  getAvailableCommands,
  type Message,
} from "markov-machines";
import { demoCharter } from "../src/agent/charter";

// Filter out messages with empty content (Anthropic API requires non-empty content)
function filterValidMessages(messages: Message[]): Message[] {
  return messages.filter((msg) => {
    if (!msg.content) return false;
    if (Array.isArray(msg.content)) {
      return msg.content.length > 0;
    }
    if (typeof msg.content === "string") {
      return msg.content.length > 0;
    }
    return true;
  });
}

export const executeCommand = action({
  args: {
    sessionId: v.id("sessions"),
    commandName: v.string(),
    input: v.any(),
    instanceId: v.optional(v.string()),
  },
  handler: async (ctx, { sessionId, commandName, input, instanceId }): Promise<{ success: boolean; value?: unknown; error?: string }> => {
    const session = await ctx.runQuery(api.sessions.get, { id: sessionId });
    if (!session) {
      throw new Error("Session not found");
    }

    const history = await ctx.runQuery(api.sessions.getFullHistory, { sessionId });

    const instance = deserializeInstance(demoCharter, session.instance);

    const machine = createMachine(demoCharter, {
      instance,
      history: filterValidMessages(history as Message[]),
    });

    const { machine: updatedMachine, result } = await runCommand(
      machine,
      commandName,
      input,
      instanceId
    );

    if (!result.success) {
      return {
        success: false,
        error: result.error || "Command execution failed",
      };
    }

    const turnId = await ctx.runMutation(api.machineTurns.create, {
      sessionId,
      parentId: session.turnId,
      instanceId: updatedMachine.instance.id,
      instance: serializeInstance(updatedMachine.instance, demoCharter),
    });

    await ctx.runMutation(api.machineSteps.add, {
      sessionId,
      turnId,
      stepNumber: 1,
      yieldReason: "command",
      response: JSON.stringify(result.value),
      done: true,
      messages: [],
      instance: serializeInstance(updatedMachine.instance, demoCharter),
      activeNodeInstructions: updatedMachine.instance.node.instructions?.slice(0, 100) || "",
    });

    await ctx.runMutation(api.sessions.finalizeTurn, {
      turnId,
      instance: serializeInstance(updatedMachine.instance, demoCharter),
      messages: [],
    });

    return {
      success: true,
      value: result.value,
    };
  },
});

export const getCommands = action({
  args: {
    sessionId: v.id("sessions"),
  },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.runQuery(api.sessions.get, { id: sessionId });
    if (!session) {
      return [];
    }

    const instance = deserializeInstance(demoCharter, session.instance);

    const machine = createMachine(demoCharter, {
      instance,
      history: [],
    });

    return getAvailableCommands(machine);
  },
});
