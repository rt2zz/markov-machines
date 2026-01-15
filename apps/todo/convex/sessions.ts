import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

/**
 * Create a new session with initial history entry (no turn yet).
 */
export const create = mutation({
  args: {
    instanceId: v.string(),
    instance: v.any(), // SerializedInstance
  },
  handler: async (ctx, { instanceId, instance }) => {
    // Create session first
    const sessionId = await ctx.db.insert("sessions", {
      currentHistoryId: undefined,
    });

    // Create initial history entry
    const historyId = await ctx.db.insert("sessionHistory", {
      sessionId,
      parentId: undefined,
      instanceId,
      instance,
      createdAt: Date.now(),
    });

    // Update session to point to initial history
    await ctx.db.patch(sessionId, { currentHistoryId: historyId });

    return sessionId;
  },
});

/**
 * Get session with current history entry data.
 */
export const get = query({
  args: { id: v.id("sessions") },
  handler: async (ctx, { id }) => {
    const session = await ctx.db.get(id);
    if (!session || !session.currentHistoryId) return null;

    const currentHistory = await ctx.db.get(session.currentHistoryId);
    if (!currentHistory) return null;

    // Get the turn for this history entry (if any)
    const turn = await ctx.db
      .query("turns")
      .withIndex("by_history", (q) => q.eq("historyId", session.currentHistoryId!))
      .first();

    return {
      sessionId: id,
      historyId: session.currentHistoryId,
      instanceId: currentHistory.instanceId,
      instance: currentHistory.instance,
      turn: turn ? { messages: turn.messages, createdAt: turn.createdAt } : null,
      createdAt: currentHistory.createdAt,
    };
  },
});

/**
 * Add a new turn after runMachine.
 * Creates both sessionHistory and turns entries.
 */
export const addTurn = mutation({
  args: {
    sessionId: v.id("sessions"),
    instanceId: v.string(),
    instance: v.any(), // SerializedInstance
    messages: v.array(v.any()), // Message[] from this turn
  },
  handler: async (ctx, { sessionId, instanceId, instance, messages }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error("Session not found");

    const now = Date.now();

    // Create history entry
    const historyId = await ctx.db.insert("sessionHistory", {
      sessionId,
      parentId: session.currentHistoryId,
      instanceId,
      instance,
      createdAt: now,
    });

    // Create turn entry
    await ctx.db.insert("turns", {
      sessionId,
      historyId,
      instanceId,
      messages,
      createdAt: now,
    });

    // Update session pointer
    await ctx.db.patch(sessionId, { currentHistoryId: historyId });

    return historyId;
  },
});

/**
 * Get full message history by walking the parentId chain.
 */
export const getFullHistory = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session?.currentHistoryId) return [];

    // Get all history entries for this session
    const allEntries = await ctx.db
      .query("sessionHistory")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect();

    // Build a map for quick lookup
    const entryMap = new Map(allEntries.map((e) => [e._id, e]));

    // Walk from current back to root
    const orderedEntries: typeof allEntries = [];
    let currentId: Id<"sessionHistory"> | undefined = session.currentHistoryId;

    while (currentId) {
      const entry = entryMap.get(currentId);
      if (!entry) break;
      orderedEntries.unshift(entry);
      currentId = entry.parentId ?? undefined;
    }

    // Join turns and collect messages
    const messages: unknown[] = [];
    for (const entry of orderedEntries) {
      const turn = await ctx.db
        .query("turns")
        .withIndex("by_history", (q) => q.eq("historyId", entry._id))
        .first();
      if (turn) {
        messages.push(...turn.messages);
      }
    }

    return messages;
  },
});

/**
 * Get all history entries for a session (for time travel UI).
 */
export const getHistoryTree = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) return null;

    const entries = await ctx.db
      .query("sessionHistory")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect();

    // Get turns for each entry
    const entriesWithTurns = await Promise.all(
      entries.map(async (entry) => {
        const turn = await ctx.db
          .query("turns")
          .withIndex("by_history", (q) => q.eq("historyId", entry._id))
          .first();
        return {
          ...entry,
          turn: turn ? { messages: turn.messages } : null,
        };
      })
    );

    return {
      currentHistoryId: session.currentHistoryId,
      entries: entriesWithTurns,
    };
  },
});

/**
 * Time travel to a specific history entry.
 * Does not delete any entries (branching is preserved).
 */
export const timeTravel = mutation({
  args: {
    sessionId: v.id("sessions"),
    targetHistoryId: v.id("sessionHistory"),
  },
  handler: async (ctx, { sessionId, targetHistoryId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error("Session not found");

    const targetHistory = await ctx.db.get(targetHistoryId);
    if (!targetHistory) throw new Error("Target history entry not found");

    if (targetHistory.sessionId !== sessionId) {
      throw new Error("Target history entry belongs to a different session");
    }

    // Update the current pointer
    await ctx.db.patch(sessionId, { currentHistoryId: targetHistoryId });
  },
});
