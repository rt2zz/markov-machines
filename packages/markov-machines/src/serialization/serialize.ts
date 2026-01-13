import { z } from "zod";
import type { Node } from "../types/node.js";
import type { NodeInstance } from "../types/instance.js";
import type { Machine, SerializedMachine, SerializedInstance } from "../types/machine.js";
import type { Ref, SerialNode, SerialTransition } from "../types/refs.js";
import type { Charter } from "../types/charter.js";
import type { Transition } from "../types/transitions.js";
import { isRef, isSerialTransition } from "../types/refs.js";
import { isCodeTransition, isGeneralTransition } from "../types/transitions.js";

/**
 * Serialize a node to a SerialNode or Ref.
 * If the node is registered in the charter, returns a Ref.
 * Otherwise, serializes the full node.
 */
export function serializeNode<S>(
  node: Node<S>,
  charter?: Charter,
): SerialNode<S> | Ref {
  // Check if this node is registered in the charter
  if (charter) {
    for (const [name, registeredNode] of Object.entries(charter.nodes)) {
      if (registeredNode.id === node.id) {
        return { ref: name };
      }
    }
  }

  // Serialize the validator to JSON Schema
  const validator = z.toJSONSchema(node.validator, { target: "draft-2020-12" });

  // Serialize transitions
  const transitions: Record<string, Ref | SerialTransition> = {};
  for (const [name, transition] of Object.entries(node.transitions)) {
    const serialized = serializeTransition(transition, charter);
    // Convert SerialNode to a SerialTransition wrapper if needed
    if (!isRef(serialized)) {
      transitions[name] = {
        description: "Transition",
        node: serialized,
      };
    } else {
      transitions[name] = serialized;
    }
  }

  return {
    executor: node.executor,
    instructions: node.instructions,
    validator,
    transitions,
    initialState: node.initialState,
  };
}

/**
 * Serialize a transition to a Ref or inline definition.
 */
function serializeTransition<S>(
  transition: Transition<S>,
  charter?: Charter,
): Ref | SerialNode {
  // If it's already a ref, keep it
  if (isRef(transition)) {
    return transition;
  }

  // Code transitions and general transitions can't be fully serialized
  // They must be registered in the charter
  if (isCodeTransition(transition) || isGeneralTransition(transition)) {
    // Check if registered
    if (charter) {
      for (const [name, registeredTransition] of Object.entries(
        charter.transitions
      )) {
        if (registeredTransition === transition) {
          return { ref: name };
        }
      }
    }
    throw new Error(
      "CodeTransition and GeneralTransition must be registered in the charter for serialization"
    );
  }

  // SerialTransition - already serializable
  if (isSerialTransition(transition)) {
    if (isRef(transition.node)) {
      return transition.node;
    }
    return transition.node as SerialNode;
  }

  throw new Error("Unknown transition type");
}

/**
 * Serialize a node instance to a SerializedInstance.
 */
export function serializeInstance(
  instance: NodeInstance,
  charter?: Charter,
): SerializedInstance {
  const serializedNode = serializeNode(instance.node, charter);

  return {
    node: serializedNode,
    state: instance.state,
    child: instance.child
      ? serializeInstance(instance.child, charter)
      : undefined,
  };
}

/**
 * Serialize a machine for persistence.
 */
export function serializeMachine(
  machine: Machine,
): SerializedMachine {
  return {
    instance: serializeInstance(machine.instance, machine.charter),
    history: machine.history,
  };
}
