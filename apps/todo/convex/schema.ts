import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Todos table - synced from agent state
  todos: defineTable({
    text: v.string(),
    completed: v.boolean(),
    createdAt: v.number(),
  }),

  // Sessions table - tracks current position and flat history
  sessions: defineTable({
    currentNodeId: v.optional(v.id("sessionNodes")), // Points to current sessionNode (optional during creation)
    history: v.array(v.any()), // Message[] - flat history across all nodes
  }),

  // SessionNodes table - tree of node visits with state snapshots
  sessionNodes: defineTable({
    sessionId: v.id("sessions"),
    parentId: v.optional(v.id("sessionNodes")), // null for root, enables branching
    node: v.any(), // SerialNode | Ref at this point
    state: v.any(), // State snapshot for this node
    enteredAt: v.number(), // Timestamp
    transitionReason: v.optional(v.string()), // Why we transitioned here
  })
    .index("by_session", ["sessionId"])
    .index("by_parent", ["parentId"]),

  // Messages table - for chat UI
  messages: defineTable({
    sessionId: v.id("sessions"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    createdAt: v.number(),
  }).index("by_session", ["sessionId"]),
});
