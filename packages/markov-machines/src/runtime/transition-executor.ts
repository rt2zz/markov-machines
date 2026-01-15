import { v4 as uuid } from "uuid";
import { z } from "zod";
import type { Charter } from "../types/charter.js";
import type { Node } from "../types/node.js";
import type {
  Transition,
  TransitionContext,
  TransitionResult,
  TransitionHelpers,
} from "../types/transitions.js";
import { transitionTo } from "../types/transitions.js";
import type { SerialNode, Ref } from "../types/refs.js";
import {
  isCodeTransition,
  isGeneralTransition,
} from "../types/transitions.js";
import { isRef, isSerialTransition } from "../types/refs.js";
import { createHelpers } from "../core/transition.js";

/**
 * Execute a transition and return the result.
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
  const helpers = createHelpers();

  // Resolve ref to actual transition
  const resolved = isRef(transition)
    ? charter.transitions[transition.ref]
    : transition;

  if (!resolved) {
    const refInfo = isRef(transition) ? `ref "${transition.ref}"` : "inline transition";
    throw new Error(`Could not resolve transition: ${refInfo}`);
  }

  // Code transition - execute with helpers
  if (isCodeTransition<S>(resolved)) {
    return resolved.execute(state, ctx, helpers);
  }

  // General transition - deserialize inline node
  if (isGeneralTransition(resolved)) {
    const nodeArg = args as { node?: SerialNode<unknown> };
    if (!nodeArg?.node) {
      throw new Error("General transition requires a node argument");
    }
    return transitionTo(deserializeNode(charter, nodeArg.node));
  }

  // Serial transition - resolve node ref or deserialize inline
  if (isSerialTransition(resolved)) {
    if (isRef(resolved.node)) {
      const node = charter.nodes[resolved.node.ref];
      if (!node) {
        throw new Error(`Unknown node ref: ${resolved.node.ref}`);
      }
      return transitionTo(node);
    }
    return transitionTo(deserializeNode(charter, resolved.node));
  }

  throw new Error(`Unknown transition type: ${typeof resolved === "object" ? JSON.stringify(Object.keys(resolved)) : typeof resolved}`);
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
  const validator = z.fromJSONSchema(serialNode.validator) as z.ZodType<S>;

  // Resolve transition refs
  // Charter registry stores Transition<any> since it holds transitions for nodes
  // with different state types. Cast is required when assigning to typed record.
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
