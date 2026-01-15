import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { createCharter } from "../core/charter.js";
import { createNode } from "../core/node.js";
import { createInstance, getActiveInstance, getInstancePath } from "../types/instance.js";
import { createMachine } from "../core/machine.js";
import { runMachine } from "../core/run.js";
import type { Executor, RunResult, RunOptions } from "../executor/types.js";
import type { Charter } from "../types/charter.js";
import type { Instance } from "../types/instance.js";
import type { CodeTransition } from "../types/transitions.js";

/**
 * Mock executor that simulates agent behavior for testing.
 * Allows us to control what the "agent" does (spawn, cede, etc.)
 */
function createMockExecutor(
  behavior: (
    charter: Charter,
    instance: Instance,
    ancestors: Instance[],
    input: string,
  ) => Partial<RunResult>,
): Executor {
  return {
    type: "standard",
    run: async (
      charter: Charter,
      instance: Instance,
      ancestors: Instance[],
      input: string,
      _options?: RunOptions,
    ): Promise<RunResult> => {
      const result = behavior(charter, instance, ancestors, input);
      return {
        response: result.response ?? "ok",
        instance: result.instance ?? instance,
        messages: result.messages ?? [],
        stopReason: result.stopReason ?? "end_turn",
        cedePayload: result.cedePayload,
        packStates: result.packStates,
      };
    },
  };
}

// Simple state schemas for testing
const parentStateValidator = z.object({
  value: z.string(),
});
type ParentState = z.infer<typeof parentStateValidator>;

const childStateValidator = z.object({
  query: z.string(),
  result: z.string().optional(),
});
type ChildState = z.infer<typeof childStateValidator>;

describe("spawn behavior", () => {
  it("should add a child instance when spawn is returned", async () => {
    // Create child node
    const childNode = createNode<ChildState>({
      instructions: "Child node",
      validator: childStateValidator,
      initialState: { query: "", result: undefined },
    });

    // Spawn transition
    const spawnChild: CodeTransition<ParentState> = {
      description: "Spawn a child",
      execute: (_state, _ctx, { spawn }) => {
        return spawn(childNode, { query: "test query", result: undefined });
      },
    };

    // Create parent node
    const parentNode = createNode<ParentState>({
      instructions: "Parent node",
      validator: parentStateValidator,
      transitions: { spawnChild: { ref: "spawnChild" } },
      initialState: { value: "parent" },
    });

    // Create executor that simulates spawn
    const executor = createMockExecutor((charter, instance, _ancestors, _input) => {
      // Simulate the agent calling spawn
      const newChild = createInstance(childNode, { query: "test query", result: undefined });
      return {
        instance: {
          ...instance,
          child: newChild,
        },
        stopReason: "end_turn",
      };
    });

    const charter = createCharter({
      name: "test",
      executor,
      transitions: { spawnChild },
      nodes: { parentNode, childNode },
    });

    const machine = createMachine(charter, {
      instance: createInstance(parentNode, { value: "parent" }),
    });

    const result = await runMachine(machine, "spawn a child");

    // Verify child was added
    expect(result.instance.child).toBeDefined();
    expect(result.instance.child).not.toBeInstanceOf(Array);
    const child = result.instance.child as Instance;
    expect(child.node.id).toBe(childNode.id);
    expect(child.state).toEqual({ query: "test query", result: undefined });
  });

  it("should make spawned child the active instance", async () => {
    const childNode = createNode<ChildState>({
      instructions: "Child node",
      validator: childStateValidator,
      initialState: { query: "", result: undefined },
    });

    const parentNode = createNode<ParentState>({
      instructions: "Parent node",
      validator: parentStateValidator,
      initialState: { value: "parent" },
    });

    // First call: spawn child
    // Second call: run on child
    let callCount = 0;
    const executor = createMockExecutor((charter, instance, _ancestors, _input) => {
      callCount++;
      if (callCount === 1) {
        // First call - spawn the child
        const newChild = createInstance(childNode, { query: "spawned", result: undefined });
        return {
          instance: { ...instance, child: newChild },
          stopReason: "end_turn",
        };
      }
      return { instance, stopReason: "end_turn" };
    });

    const charter = createCharter({
      name: "test",
      executor,
      nodes: { parentNode, childNode },
    });

    // After spawn
    const machine1 = createMachine(charter, {
      instance: createInstance(parentNode, { value: "parent" }),
    });
    const result1 = await runMachine(machine1, "spawn");

    // Verify child is now active
    const activePath = getInstancePath(result1.instance);
    expect(activePath.length).toBe(2);
    expect(activePath[0]?.node.id).toBe(parentNode.id);
    expect(activePath[1]?.node.id).toBe(childNode.id);

    const active = getActiveInstance(result1.instance);
    expect(active.node.id).toBe(childNode.id);
  });
});

describe("cede behavior", () => {
  it("should remove child instance when cede is returned", async () => {
    const childNode = createNode<ChildState>({
      instructions: "Child node",
      validator: childStateValidator,
      initialState: { query: "", result: undefined },
    });

    const parentNode = createNode<ParentState>({
      instructions: "Parent node",
      validator: parentStateValidator,
      initialState: { value: "parent" },
    });

    // Executor that simulates cede
    const executor = createMockExecutor((_charter, instance, _ancestors, _input) => {
      return {
        instance,
        stopReason: "cede",
        cedePayload: { result: "done" },
      };
    });

    const charter = createCharter({
      name: "test",
      executor,
      nodes: { parentNode, childNode },
    });

    // Start with parent that already has a child
    const childInstance = createInstance(childNode, { query: "test", result: "found" });
    const parentInstance = createInstance(parentNode, { value: "parent" }, childInstance);

    const machine = createMachine(charter, {
      instance: parentInstance,
    });

    const result = await runMachine(machine, "cede back");

    // CRITICAL: After cede, child should be REMOVED
    expect(result.instance.child).toBeUndefined();
    expect(result.stopReason).toBe("cede");
    expect(result.cedePayload).toEqual({ result: "done" });

    // Parent should now be the active instance
    const active = getActiveInstance(result.instance);
    expect(active.node.id).toBe(parentNode.id);
  });

  it("should return cede payload to caller", async () => {
    const childNode = createNode<ChildState>({
      instructions: "Child node",
      validator: childStateValidator,
      initialState: { query: "", result: undefined },
    });

    const parentNode = createNode<ParentState>({
      instructions: "Parent node",
      validator: parentStateValidator,
      initialState: { value: "parent" },
    });

    const executor = createMockExecutor((_charter, instance, _ancestors, _input) => {
      return {
        instance,
        stopReason: "cede",
        cedePayload: { findings: ["item1", "item2"], query: "test" },
      };
    });

    const charter = createCharter({
      name: "test",
      executor,
      nodes: { parentNode, childNode },
    });

    const childInstance = createInstance(childNode, { query: "test", result: undefined });
    const parentInstance = createInstance(parentNode, { value: "parent" }, childInstance);

    const machine = createMachine(charter, { instance: parentInstance });
    const result = await runMachine(machine, "complete");

    expect(result.cedePayload).toEqual({ findings: ["item1", "item2"], query: "test" });
  });

  it("should work with nested spawn/cede cycle", async () => {
    const childNode = createNode<ChildState>({
      instructions: "Child node",
      validator: childStateValidator,
      initialState: { query: "", result: undefined },
    });

    const parentNode = createNode<ParentState>({
      instructions: "Parent node",
      validator: parentStateValidator,
      initialState: { value: "parent" },
    });

    let step = 0;
    const executor = createMockExecutor((_charter, instance, ancestors, _input) => {
      step++;

      if (step === 1) {
        // Step 1: Parent spawns child
        const newChild = createInstance(childNode, { query: "research", result: undefined });
        return {
          instance: { ...instance, child: newChild },
          stopReason: "end_turn",
        };
      }

      if (step === 2) {
        // Step 2: Child does work (runs on child since it's active)
        return {
          instance: { ...instance, state: { query: "research", result: "found stuff" } },
          stopReason: "end_turn",
        };
      }

      if (step === 3) {
        // Step 3: Child cedes back with results
        return {
          instance,
          stopReason: "cede",
          cedePayload: { result: "found stuff" },
        };
      }

      return { instance, stopReason: "end_turn" };
    });

    const charter = createCharter({
      name: "test",
      executor,
      nodes: { parentNode, childNode },
    });

    // Step 1: Spawn
    const machine1 = createMachine(charter, {
      instance: createInstance(parentNode, { value: "parent" }),
    });
    const result1 = await runMachine(machine1, "spawn child");

    expect(result1.instance.child).toBeDefined();
    expect(getActiveInstance(result1.instance).node.id).toBe(childNode.id);

    // Step 2: Child works
    const machine2 = createMachine(charter, {
      instance: result1.instance,
    });
    const result2 = await runMachine(machine2, "do research");

    expect(result2.instance.child).toBeDefined();
    const childAfterWork = result2.instance.child as Instance;
    expect(childAfterWork.state).toEqual({ query: "research", result: "found stuff" });

    // Step 3: Child cedes
    const machine3 = createMachine(charter, {
      instance: result2.instance,
    });
    const result3 = await runMachine(machine3, "cede results");

    // After cede, child should be gone
    expect(result3.instance.child).toBeUndefined();
    expect(result3.stopReason).toBe("cede");
    expect(result3.cedePayload).toEqual({ result: "found stuff" });
    expect(getActiveInstance(result3.instance).node.id).toBe(parentNode.id);
  });
});

describe("instance path tracking", () => {
  it("should correctly track path from root to active leaf", () => {
    const grandchildNode = createNode({
      instructions: "Grandchild",
      validator: z.object({ x: z.number() }),
      initialState: { x: 3 },
    });

    const childNode = createNode({
      instructions: "Child",
      validator: z.object({ x: z.number() }),
      initialState: { x: 2 },
    });

    const parentNode = createNode({
      instructions: "Parent",
      validator: z.object({ x: z.number() }),
      initialState: { x: 1 },
    });

    const grandchild = createInstance(grandchildNode, { x: 3 });
    const child = createInstance(childNode, { x: 2 }, grandchild);
    const parent = createInstance(parentNode, { x: 1 }, child);

    const path = getInstancePath(parent);

    expect(path.length).toBe(3);
    expect(path[0]?.state).toEqual({ x: 1 });
    expect(path[1]?.state).toEqual({ x: 2 });
    expect(path[2]?.state).toEqual({ x: 3 });
  });

  it("should follow last child when multiple children exist", () => {
    const childNode = createNode({
      instructions: "Child",
      validator: z.object({ id: z.number() }),
      initialState: { id: 0 },
    });

    const parentNode = createNode({
      instructions: "Parent",
      validator: z.object({ x: z.number() }),
      initialState: { x: 1 },
    });

    const child1 = createInstance(childNode, { id: 1 });
    const child2 = createInstance(childNode, { id: 2 });
    const child3 = createInstance(childNode, { id: 3 });
    const parent = createInstance(parentNode, { x: 1 }, [child1, child2, child3]);

    const active = getActiveInstance(parent);
    expect(active.state).toEqual({ id: 3 });

    const path = getInstancePath(parent);
    expect(path.length).toBe(2);
    expect(path[1]?.state).toEqual({ id: 3 });
  });
});
