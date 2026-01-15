# markov-machines

A small framework for building stateful, multi-node agent workflows. It models an agent as a tree of node instances, supports tool execution and transitions, and persists state/history for long-running sessions.

## Core concepts

- Charter: static registry for nodes, transitions, tools, packs, and the executor.
- Node: instructions, tools, transitions, and a Zod validator for state.
- Instance: runtime node + state (and optional child instances).
- Machine: charter + root instance + conversation history.

## Execution model

`runMachine` performs a single tool-aware inference loop and yields a `MachineStep` for every API call. It keeps executing until the model ends the turn, or a step limit is reached.

Transitions can:
- transition: replace the current node with another.
- spawn: add child node instances; the active instance is the last child.
- cede: remove the current instance and return control to the parent.

## Packs

Packs are reusable modules with their own state and tools. Pack state is stored on the root instance and shared across all nodes that include the pack. Pack tools only receive pack state, not node state.

## Serialization

`serializeMachine` and `deserializeMachine` allow persistence of the instance tree and history. Code transitions and inline nodes must be registered in the charter for ref-based serialization.

## Usage example

```ts
import { z } from "zod";
import {
  createCharter,
  createMachine,
  createNode,
  createInstance,
  createStandardExecutor,
  runMachineToCompletion,
  transitionTo,
} from "markov-machines";

const idleNode = createNode({
  instructions: "You are a helpful assistant.",
  validator: z.object({ count: z.number() }),
  tools: {},
  transitions: {},
  initialState: { count: 0 },
});

const charter = createCharter({
  name: "demo",
  executor: createStandardExecutor({ apiKey: process.env.ANTHROPIC_API_KEY }),
  nodes: { idle: idleNode },
});

const rootInstance = createInstance(idleNode, { count: 0 });
const machine = createMachine(charter, { instance: rootInstance });

const step = await runMachineToCompletion(machine, "Hello!");
console.log(step.response);
```

## Exports

Public APIs are exported from `packages/markov-machines/index.ts` including:
- `createCharter`, `createNode`, `createMachine`, `runMachine`, `runMachineToCompletion`
- Transition helpers: `createTransition`, `transitionTo`, `createHelpers`
- Serialization helpers: `serializeMachine`, `deserializeMachine`, etc.
- Types for nodes, instances, transitions, tools, messages, and packs
