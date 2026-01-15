"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import {
  runMachine,
  createMachine,
  serializeInstance,
  deserializeInstance,
  createInstance,
  type Instance,
  type Node,
  type Message,
} from "markov-machines";
import { todoCharter, mainNode, createInitialState } from "../src/agent/charter";

export const send = action({
  args: {
    sessionId: v.id("sessions"),
    message: v.string(),
  },
  handler: async (ctx, { sessionId, message }): Promise<string> => {
    // Get session with current instance
    const session = await ctx.runQuery(api.sessions.get, { id: sessionId });
    if (!session) {
      throw new Error("Session not found");
    }

    // Get full history by walking the turn chain
    const history = await ctx.runQuery(api.sessions.getFullHistory, { sessionId });

    // Deserialize the instance from persisted state
    const instance = deserializeInstance(todoCharter, session.instance);

    // Create machine with history
    const machine = createMachine(todoCharter, {
      instance,
      history: history as Message[],
    });

    // Add user message to UI
    await ctx.runMutation(api.messages.add, {
      sessionId,
      role: "user",
      content: message,
    });

    // Run agent
    const result = await runMachine(machine, message);

    // Serialize the instance for storage
    const serializedInstance = serializeInstance(result.instance, todoCharter);

    // Always create a new turn (regardless of whether transition occurred)
    await ctx.runMutation(api.sessions.addTurn, {
      sessionId,
      instanceId: result.instance.id,
      instance: serializedInstance,
      messages: result.messages,
    });

    // Sync todos to Convex (if state has todos)
    const currentState = result.instance.state;
    if (currentState && typeof currentState === "object" && "todos" in currentState) {
      const todos = (currentState as { todos: Array<{ id: string; text: string; completed: boolean }> }).todos;
      await ctx.runMutation(api.todos.sync, { todos });
    }

    // Add assistant message to UI
    await ctx.runMutation(api.messages.add, {
      sessionId,
      role: "assistant",
      content: result.response,
    });

    return result.response;
  },
});

export const createSession = action({
  args: {},
  handler: async (ctx): Promise<Id<"sessions">> => {
    const initialState = createInitialState();

    // Create instance
    const instance: Instance = createInstance(
      mainNode as Node<unknown>,
      initialState,
    );

    // Serialize for storage
    const serializedInstance = serializeInstance(instance, todoCharter);

    const sessionId = await ctx.runMutation(api.sessions.create, {
      instanceId: instance.id,
      instance: serializedInstance,
    });

    return sessionId;
  },
});
