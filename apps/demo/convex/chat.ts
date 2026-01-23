"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  runMachine,
  createMachine,
  serializeInstance,
  deserializeInstance,
  createInstance,
  getMessageText,
  type Instance,
  type Node,
  type Message,
  type MachineStep,
} from "markov-machines";
import { demoCharter, rootNode } from "../src/agent/charter";

function getActiveNodeInstructions(instance: Instance): string {
  const instructions = instance.node.instructions || "";
  return instructions.slice(0, 100);
}

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

function getStepResponse(step: MachineStep<unknown>): string {
  for (let i = step.messages.length - 1; i >= 0; i--) {
    const msg = step.messages[i];
    if (msg && msg.role === "assistant") {
      return getMessageText(msg);
    }
  }
  return "";
}

export const send = action({
  args: {
    sessionId: v.id("sessions"),
    message: v.string(),
  },
  handler: async (ctx, { sessionId, message }): Promise<string> => {
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

    await ctx.runMutation(api.messages.add, {
      sessionId,
      role: "user",
      content: message,
    });

    const turnId = await ctx.runMutation(api.machineTurns.create, {
      sessionId,
      parentId: session.turnId,
      instanceId: machine.instance.id,
      instance: serializeInstance(machine.instance, demoCharter),
    });

    let stepNumber = 0;
    let lastStep: MachineStep | null = null;
    const allMessages: Message[] = [];

    for await (const step of runMachine(machine, message, { maxSteps: 10 })) {
      stepNumber++;
      allMessages.push(...step.messages);

      await ctx.runMutation(api.machineSteps.add, {
        sessionId,
        turnId,
        stepNumber,
        yieldReason: step.yieldReason,
        response: getStepResponse(step),
        done: step.done,
        messages: step.messages,
        instance: serializeInstance(step.instance, demoCharter),
        activeNodeInstructions: getActiveNodeInstructions(step.instance),
      });

      lastStep = step;
    }

    if (!lastStep) {
      throw new Error("No steps executed");
    }

    await ctx.runMutation(api.sessions.finalizeTurn, {
      turnId,
      instance: serializeInstance(lastStep.instance, demoCharter),
      messages: allMessages,
    });

    const responseText = getStepResponse(lastStep);
    await ctx.runMutation(api.messages.add, {
      sessionId,
      role: "assistant",
      content: responseText,
      turnId,
    });

    return responseText;
  },
});

export const createSession = action({
  args: {},
  handler: async (ctx): Promise<Id<"sessions">> => {
    const instance: Instance = createInstance(rootNode as Node<unknown>, {});

    const serializedInstance = serializeInstance(instance, demoCharter);

    const sessionId = await ctx.runMutation(api.sessions.create, {
      instanceId: instance.id,
      instance: serializedInstance,
    });

    return sessionId;
  },
});
