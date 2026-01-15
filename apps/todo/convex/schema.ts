import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Todos table - synced from agent state
  todos: defineTable({
    text: v.string(),
    completed: v.boolean(),
    createdAt: v.number(),
  }),

  // Sessions table - tracks current position
  sessions: defineTable({
    currentHistoryId: v.optional(v.id("sessionHistory")), // Points to latest history entry
  }),

  // SessionHistory table - instance snapshots per turn (one per runMachine call)
  sessionHistory: defineTable({
    sessionId: v.id("sessions"),
    parentId: v.optional(v.id("sessionHistory")), // Previous history entry (for branching/forking)
    instanceId: v.string(), // Active instance ID that handled this turn
    instance: v.any(), // SerializedInstance snapshot after this turn
    createdAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_parent", ["parentId"]),

  // Turns table - messages per turn (1:1 with sessionHistory)
  turns: defineTable({
    sessionId: v.id("sessions"),
    historyId: v.id("sessionHistory"), // Links to corresponding history entry
    instanceId: v.string(), // Active instance ID that handled this turn
    messages: v.array(v.any()), // Message[] from this turn only
    createdAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_history", ["historyId"]),

  // Messages table - for chat UI
  messages: defineTable({
    sessionId: v.id("sessions"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    createdAt: v.number(),
  }).index("by_session", ["sessionId"]),
});
