import type { Charter } from "../types/charter.js";
import type { NodeInstance } from "../types/instance.js";
import type { Node } from "../types/node.js";
import type { Ref } from "../types/refs.js";
import { isRef } from "../types/refs.js";
import { resolveExecutor, resolveNode } from "../runtime/ref-resolver.js";
import type { Executor, VesselExecutorConfig, RunOptions, RunResult } from "./types.js";

/**
 * Vessel executor - a container that delegates to a child node.
 * Does not make LLM calls itself. Just holds state/tools and delegates.
 */
export class VesselExecutor implements Executor {
  type = "vessel" as const;
  private childNode: Ref | Node<unknown>;
  private childInitialState?: unknown | ((parentState: unknown) => unknown);

  constructor(config: VesselExecutorConfig) {
    this.childNode = config.childNode;
    this.childInitialState = config.childInitialState;
  }

  async run(
    charter: Charter,
    instance: NodeInstance,
    ancestors: NodeInstance[],
    input: string,
    options?: RunOptions,
  ): Promise<RunResult> {
    // Resolve child node if it's a ref
    let childNodeDef: Node<unknown>;
    if (isRef(this.childNode)) {
      const resolved = resolveNode(charter, this.childNode.ref);
      if (!resolved) {
        throw new Error(
          `Unknown child node ref "${this.childNode.ref}" in vessel executor`,
        );
      }
      childNodeDef = resolved;
    } else {
      childNodeDef = this.childNode;
    }

    // Determine child initial state
    let childState: unknown;
    if (instance.child) {
      // Use existing child state
      childState = instance.child.state;
    } else if (this.childInitialState !== undefined) {
      // Derive from config
      childState =
        typeof this.childInitialState === "function"
          ? this.childInitialState(instance.state)
          : this.childInitialState;
    } else if (childNodeDef.initialState !== undefined) {
      // Use child node's default initial state
      childState = childNodeDef.initialState;
    } else {
      throw new Error(
        `Vessel executor has no child state: no existing child, no childInitialState config, and child node has no initialState`,
      );
    }

    // Build child instance
    const childInstance: NodeInstance = {
      node: childNodeDef,
      state: childState,
      child: instance.child?.child, // Preserve any deeper children
    };

    // Get child's executor
    const childExecutorRef = childNodeDef.executor.ref;
    const childExecutor = resolveExecutor(charter, childExecutorRef);
    if (!childExecutor) {
      throw new Error(
        `Unknown executor ref "${childExecutorRef}" for child node`,
      );
    }

    // Build new ancestors list (current instance becomes an ancestor)
    const newAncestors = [...ancestors, instance];

    // Delegate to child executor
    const result = await childExecutor.run(
      charter,
      childInstance,
      newAncestors,
      input,
      options,
    );

    // Wrap result: this instance with updated child
    const updatedInstance: NodeInstance = {
      node: instance.node,
      state: instance.state, // Vessel state unchanged by child execution
      child: result.instance,
    };

    return {
      response: result.response,
      instance: updatedInstance,
      messages: result.messages,
      stopReason: result.stopReason,
    };
  }
}

/**
 * Create a vessel executor instance.
 */
export function createVesselExecutor(config: VesselExecutorConfig): VesselExecutor {
  return new VesselExecutor(config);
}
