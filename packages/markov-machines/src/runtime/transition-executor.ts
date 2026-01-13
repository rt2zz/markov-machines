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
import { isRef, isSerialTransition } from "../types/refs.js";

/**
 * Execute a transition and return the target node and optional new state.
 * S is the source state type.
 */
export async function executeTransition<S>(
  charter: Charter,
  transition: Transition<S>,
  state: S,
  reason: string,
  args: unknown,
): Promise<TransitionResult> {
  const ctx: TransitionContext = { args, reason };

  // Resolve ref to actual transition
  const resolved = isRef(transition)
    ? charter.transitions[transition.ref]
    : transition;

  if (!resolved) {
    throw new Error(`Could not resolve transition`);
  }

  // Code transition - execute the function (returns { node, state? })
  if (isCodeTransition<S>(resolved)) {
    return resolved.execute(state, ctx);
  }

  // General transition - deserialize inline node (no state transform)
  if (isGeneralTransition(resolved)) {
    const nodeArg = args as { node?: SerialNode<unknown> };
    if (!nodeArg?.node) {
      throw new Error("General transition requires a node argument");
    }
    return { node: deserializeNode(charter, nodeArg.node) };
  }

  // Serial transition - resolve node ref or deserialize inline (no state transform)
  if (isSerialTransition(resolved)) {
    if (isRef(resolved.node)) {
      const node = charter.nodes[resolved.node.ref];
      if (!node) {
        throw new Error(`Unknown node ref: ${resolved.node.ref}`);
      }
      return { node };
    }
    return { node: deserializeNode(charter, resolved.node) };
  }

  throw new Error("Unknown transition type");
}

/**
 * Deserialize a SerialNode into a Node.
 * Resolves transition refs from the charter.
 * Note: Inline node tools cannot be serialized and will be empty on deserialization.
 */
export function deserializeNode<S>(
  charter: Charter,
  serialNode: SerialNode<S>,
): Node<S> {
  // Deserialize the JSON Schema validator back to a Zod schema.
  // Note: fromJSONSchema returns z.ZodType<unknown>, but we need z.ZodType<S>.
  // TypeScript can't infer the generic from serialized data at runtime.
  const validator = z.fromJSONSchema(serialNode.validator) as z.ZodType<S>;

  // Resolve transition refs
  const transitions: Record<string, Transition<S>> = {};
  for (const [name, trans] of Object.entries(serialNode.transitions)) {
    if (isRef(trans)) {
      const resolved = charter.transitions[trans.ref];
      if (!resolved) {
        throw new Error(`Unknown transition ref in inline node: ${trans.ref}`);
      }
      transitions[name] = resolved as unknown as Transition<S>;
    } else {
      transitions[name] = trans as Transition<S>;
    }
  }

  return {
    id: uuid(),
    executor: serialNode.executor,
    instructions: serialNode.instructions,
    tools: {}, // Inline node tools cannot be serialized
    validator,
    transitions,
    initialState: serialNode.initialState,
  };
}

/**
 * Resolve a node reference or return the inline node.
 */
export function resolveNodeRef<S>(
  charter: Charter,
  nodeRef: Ref | SerialNode<S>,
): Node<S> {
  if (isRef(nodeRef)) {
    const node = charter.nodes[nodeRef.ref];
    if (!node) {
      throw new Error(`Unknown node ref: ${nodeRef.ref}`);
    }
    return node as Node<S>;
  }
  return deserializeNode(charter, nodeRef);
}
