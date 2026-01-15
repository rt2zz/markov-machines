import { v } from "convex/values";
import { query } from "./_generated/server";

/**
 * Get a turn by its history entry ID.
 */
export const getByHistoryId = query({
  args: { historyId: v.id("sessionHistory") },
  handler: async (ctx, { historyId }) => {
    return await ctx.db
      .query("turns")
      .withIndex("by_history", (q) => q.eq("historyId", historyId))
      .first();
  },
});

/**
 * List all turns for a session.
 */
export const listBySession = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    return await ctx.db
      .query("turns")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect();
  },
});
