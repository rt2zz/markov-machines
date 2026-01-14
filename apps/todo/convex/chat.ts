"use node";

import { v } from "convex/values";
import { v4 as uuid } from "uuid";
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
} from "markov-machines";
import { todoCharter, mainNode, createInitialState } from "../src/agent/charter";

export const send = action({
  args: {
    sessionId: v.id("sessions"),
    message: v.string(),
  },
  handler: async (ctx, { sessionId, message }): Promise<string> => {
    // Get session
    const session = await ctx.runQuery(api.sessions.get, { id: sessionId });
    if (!session) {
      throw new Error("Session not found");
    }

    // Deserialize the instance from persisted state
    const instance = deserializeInstance(todoCharter, {
      id: uuid(), // Generate new ID since we don't persist it
      node: session.node,
      state: session.state,
      child: undefined,
    });

    // Create machine
    const machine = createMachine(todoCharter, {
      instance,
      history: session.history,
    });

    // Store original node ID to detect transitions
    const originalNodeId = machine.instance.node.id;

    // Add user message to UI
    await ctx.runMutation(api.messages.add, {
      sessionId,
      role: "user",
      content: message,
    });

    // Run agent
    const result = await runMachine(machine, message);
    const newHistory = [...session.history, ...result.messages];

    // Check if a transition occurred (node changed)
    const transitioned = result.instance.node.id !== originalNodeId;

    // Serialize the instance for storage
    const serializedInstance = serializeInstance(result.instance, todoCharter);

    if (transitioned) {
      // Transition occurred - create new sessionNode
      await ctx.runMutation(api.sessions.transition, {
        sessionId,
        node: serializedInstance.node,
        state: serializedInstance.state,
        reason: "Agent transitioned",
        history: newHistory,
      });
    } else {
      // Same node - just update state and history
      await ctx.runMutation(api.sessions.update, {
        sessionId,
        state: serializedInstance.state,
        history: newHistory,
      });
    }

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
      node: serializedInstance.node,
      state: serializedInstance.state,
    });

    return sessionId;
  },
});
