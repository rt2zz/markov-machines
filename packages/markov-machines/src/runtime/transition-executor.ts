import { v4 as uuid } from "uuid";
import { z } from "zod";
import type { Charter } from "../types/charter.js";
import type { Node } from "../types/node.js";
import type { Transition, TransitionContext, TransitionResult } from "../types/transitions.js";
import type { SerialNode, Ref } from "../types/refs.js";
import {
  isCodeTransition,
  isGeneralTransition,
} from "../types/transitions.js";
import { isRef, isSerialNode, isSerialTransition } from "../types/refs.js";

/**
 * Execute a transition and return the target node and optional new state.
 */
export async function executeTransition<R, S>(
  charter: Charter<R>,
  transition: Transition<R, S>,
  state: S,
  rootState: R,
  reason: string,
  args: unknown,
): Promise<TransitionResult<R>> {
  const ctx: TransitionContext<R> = { args, reason, rootState };

  // Resolve ref to actual transition
  const resolved = isRef(transition)
    ? charter.transitions[transition.ref]
    : transition;

  if (!resolved) {
    throw new Error(`Could not resolve transition`);
  }

  // Code transition - execute the function (returns { node, state? })
  if (isCodeTransition<R, S>(resolved)) {
    return resolved.execute(state, ctx);
  }

  // General transition - deserialize inline node (no state transform)
  if (isGeneralTransition(resolved)) {
    const nodeArg = args as { node?: SerialNode<S> };
    if (!nodeArg?.node) {
      throw new Error("General transition requires a node argument");
    }
    // Type assertion needed: transitions can change state types
    return { node: deserializeNode(charter, nodeArg.node) as Node<R, unknown> };
  }

  // Serial transition - resolve node ref or deserialize inline (no state transform)
  if (isSerialTransition(resolved)) {
    if (isRef(resolved.node)) {
      const node = charter.nodes[resolved.node.ref];
      if (!node) {
        throw new Error(`Unknown node ref: ${resolved.node.ref}`);
      }
      // Type assertion needed: transitions can change state types
      return { node: node as Node<R, unknown> };
    }
    // Type assertion needed: transitions can change state types
    return { node: deserializeNode(charter, resolved.node as SerialNode<S>) as Node<R, unknown> };
  }

  throw new Error("Unknown transition type");
}

/**
 * Deserialize a SerialNode into a Node.
 * Resolves tool and transition refs from the charter.
 * Note: Only charter tool refs are serialized. Inline node tools
 * cannot be serialized and will be empty on deserialization.
 */
export function deserializeNode<R, S>(
  charter: Charter<R>,
  serialNode: SerialNode<S>,
): Node<R, S> {
  // Validate charter tool refs exist
  for (const toolRef of serialNode.charterTools) {
    if (!charter.tools[toolRef.ref]) {
      throw new Error(`Unknown charter tool ref in inline node: ${toolRef.ref}`);
    }
  }

  // Deserialize the JSON Schema validator back to a Zod schema.
  // Note: fromJSONSchema returns z.ZodType<unknown>, but we need z.ZodType<S>.
  // TypeScript can't infer the generic from serialized data at runtime.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const validator = z.fromJSONSchema(serialNode.validator) as any;

  // Resolve transition refs
  const transitions: Record<string, Transition<R, S>> = {};
  for (const [name, trans] of Object.entries(serialNode.transitions)) {
    if (isRef(trans)) {
      const resolved = charter.transitions[trans.ref];
      if (!resolved) {
        throw new Error(`Unknown transition ref in inline node: ${trans.ref}`);
      }
      transitions[name] = resolved;
    } else {
      transitions[name] = trans as Transition<R, S>;
    }
  }

  return {
    id: uuid(),
    instructions: serialNode.instructions,
    charterTools: serialNode.charterTools,
    tools: {}, // Inline node tools cannot be serialized
    validator,
    transitions,
    initialState: serialNode.initialState,
  };
}

/**
 * Resolve a node reference or return the inline node.
 */
export function resolveNodeRef<R, S>(
  charter: Charter<R>,
  nodeRef: Ref | SerialNode<S>,
): Node<R, S> {
  if (isRef(nodeRef)) {
    const node = charter.nodes[nodeRef.ref];
    if (!node) {
      throw new Error(`Unknown node ref: ${nodeRef.ref}`);
    }
    return node;
  }
  return deserializeNode(charter, nodeRef);
}
