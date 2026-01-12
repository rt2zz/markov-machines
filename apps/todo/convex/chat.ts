"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import {
  runMachine,
  serializeNode,
  deserializeMachine,
} from "markov-machines";
import { todoCharter, mainNode, createInitialState } from "../src/agent/charter";

export const send = action({
  args: {
    sessionId: v.id("sessions"),
    message: v.string(),
  },
  handler: async (ctx, { sessionId, message }): Promise<string> => {
    // Get session (now returns current sessionNode data)
    const session = await ctx.runQuery(api.sessions.get, { id: sessionId });
    if (!session) {
      throw new Error("Session not found");
    }

    // Reconstruct machine from persisted state
    const machine = deserializeMachine(todoCharter, {
      node: session.node,
      state: session.state,
      history: session.history,
    });

    // Store original node ID to detect transitions
    const originalNodeId = machine.node.id;

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
    const transitioned = result.node.id !== originalNodeId;

    if (transitioned) {
      // Transition occurred - create new sessionNode
      await ctx.runMutation(api.sessions.transition, {
        sessionId,
        node: serializeNode(result.node, todoCharter),
        state: result.state,
        reason: "Agent transitioned", // Could extract from transition tool call
        history: newHistory,
      });
    } else {
      // Same node - just update state and history
      await ctx.runMutation(api.sessions.update, {
        sessionId,
        state: result.state,
        history: newHistory,
      });
    }

    // Sync todos to Convex (if state has todos)
    if (result.state && typeof result.state === "object" && "todos" in result.state) {
      const todos = (result.state as { todos: Array<{ id: string; text: string; completed: boolean }> }).todos;
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
    const serializedNode = serializeNode(mainNode, todoCharter);

    const sessionId = await ctx.runMutation(api.sessions.create, {
      node: serializedNode,
      state: initialState,
    });

    return sessionId;
  },
});
