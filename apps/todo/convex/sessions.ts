import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

/**
 * Create a new session with root sessionNode.
 */
export const create = mutation({
  args: {
    node: v.any(), // SerialNode | Ref
    state: v.any(), // Initial state
  },
  handler: async (ctx, args) => {
    // Create session first (without currentNodeId - we'll update it)
    const sessionId = await ctx.db.insert("sessions", {
      currentNodeId: undefined, // Will be set after creating sessionNode
      history: [],
    });

    // Create root sessionNode
    const sessionNodeId = await ctx.db.insert("sessionNodes", {
      sessionId,
      parentId: undefined, // Root node has no parent
      node: args.node,
      state: args.state,
      enteredAt: Date.now(),
      transitionReason: undefined,
    });

    // Update session with the correct currentNodeId
    await ctx.db.patch(sessionId, { currentNodeId: sessionNodeId });

    return sessionId;
  },
});

/**
 * Get session with current sessionNode data.
 */
export const get = query({
  args: { id: v.id("sessions") },
  handler: async (ctx, { id }) => {
    const session = await ctx.db.get(id);
    if (!session || !session.currentNodeId) return null;

    const currentNode = await ctx.db.get(session.currentNodeId);
    if (!currentNode) return null;

    return {
      sessionId: id,
      node: currentNode.node,
      state: currentNode.state,
      history: session.history,
      currentNodeId: session.currentNodeId,
      enteredAt: currentNode.enteredAt,
    };
  },
});

/**
 * Get all sessionNodes for a session (for time travel UI).
 */
export const getTree = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) return null;

    const nodes = await ctx.db
      .query("sessionNodes")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect();

    return {
      currentNodeId: session.currentNodeId,
      nodes,
    };
  },
});

/**
 * Update current sessionNode's state and session history (within same node).
 */
export const update = mutation({
  args: {
    sessionId: v.id("sessions"),
    state: v.any(),
    history: v.array(v.any()),
  },
  handler: async (ctx, { sessionId, state, history }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error("Session not found");

    // Update the current sessionNode's state
    await ctx.db.patch(session.currentNodeId, { state });

    // Update session history
    await ctx.db.patch(sessionId, { history });
  },
});

/**
 * Create a new sessionNode for a transition.
 * Creates a child of the current node.
 */
export const transition = mutation({
  args: {
    sessionId: v.id("sessions"),
    node: v.any(), // New SerialNode | Ref
    state: v.any(), // New state
    reason: v.optional(v.string()),
    history: v.array(v.any()),
  },
  handler: async (ctx, { sessionId, node, state, reason, history }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error("Session not found");

    // Create new sessionNode as child of current
    const newNodeId = await ctx.db.insert("sessionNodes", {
      sessionId,
      parentId: session.currentNodeId,
      node,
      state,
      enteredAt: Date.now(),
      transitionReason: reason,
    });

    // Update session to point to new node and update history
    await ctx.db.patch(sessionId, {
      currentNodeId: newNodeId,
      history,
    });

    return newNodeId;
  },
});

/**
 * Time travel to a specific sessionNode.
 * Does not delete any nodes (branching is preserved).
 */
export const timeTravel = mutation({
  args: {
    sessionId: v.id("sessions"),
    targetNodeId: v.id("sessionNodes"),
  },
  handler: async (ctx, { sessionId, targetNodeId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error("Session not found");

    const targetNode = await ctx.db.get(targetNodeId);
    if (!targetNode) throw new Error("Target node not found");

    if (targetNode.sessionId !== sessionId) {
      throw new Error("Target node belongs to a different session");
    }

    // Just update the current pointer - no deletion
    await ctx.db.patch(sessionId, { currentNodeId: targetNodeId });
  },
});
