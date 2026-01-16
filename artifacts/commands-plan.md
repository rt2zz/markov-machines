# Plan: Add Commands to Markov-Machines

## Overview

**Commands** are user-callable methods that bypass LLM inference for deterministic actions. They can update node state, transition, spawn, or cede - the same capabilities as tools and transitions.

**Example use case:** Todo app has an "Archive All" button that marks all todos as archived without asking the LLM.

---

## Design

### Command Definition

Commands are defined on nodes, similar to tools:

```typescript
interface CommandDefinition<TInput, TOutput, S> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  execute: (
    input: TInput,
    ctx: CommandContext<S>,
  ) => Promise<CommandResult<TOutput>> | CommandResult<TOutput>;
}

interface CommandContext<S> {
  state: S;
  updateState: (patch: Partial<S>) => void;
  // Transition helpers - same as TransitionHelpers
  cede: <P>(payload?: P) => CedeResult<P>;
  spawn: <T>(node: Node<T>, state?: T) => SpawnResult<T>;
}

// Command can return a value OR a transition action
type CommandResult<T> =
  | { type: "value"; value: T }           // Just return a value
  | { type: "transition"; node: Node }     // Transition to new node
  | SpawnResult                            // Spawn children
  | CedeResult;                            // Cede to parent
```

### Node Definition

```typescript
interface Node<S> {
  // ... existing properties
  commands?: Record<string, CommandDefinition<any, any, S>>;
}
```

### Execution API

New function to execute commands from frontend:

```typescript
// Execute a command on the current active instance
async function executeCommand(
  machine: Machine,
  commandName: string,
  input: unknown,
): Promise<CommandExecutionResult> {
  // 1. Find command on active instance's node
  // 2. Validate input against schema
  // 3. Execute with CommandContext
  // 4. Apply state changes / transitions
  // 5. Return result
}

interface CommandExecutionResult {
  success: boolean;
  value?: unknown;
  error?: string;
  // Updated machine state
  instance: Instance;
}
```

### Listing Available Commands

Frontend needs to know what commands are available:

```typescript
// Get commands available on current active instance
function getAvailableCommands(machine: Machine): CommandInfo[] {
  const active = getActiveInstance(machine.instance);
  return Object.entries(active.node.commands ?? {}).map(([name, cmd]) => ({
    name,
    description: cmd.description,
    inputSchema: zodToJsonSchema(cmd.inputSchema),
  }));
}
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/types/commands.ts` | Create | CommandDefinition, CommandContext, CommandResult types |
| `src/types/node.ts` | Modify | Add `commands` property to Node interface |
| `src/runtime/command-executor.ts` | Create | executeCommand function |
| `src/core/commands.ts` | Create | getAvailableCommands, helper functions |
| `src/index.ts` | Modify | Export command types and functions |

---

## Implementation Details

### 1. Types (`src/types/commands.ts`)

```typescript
import type { z } from "zod";
import type { Node } from "./node.js";
import type { CedeResult, SpawnResult } from "./transitions.js";

export interface CommandContext<S> {
  state: S;
  updateState: (patch: Partial<S>) => void;
  cede: <P>(payload?: P) => CedeResult<P>;
  spawn: <T>(node: Node<T>, state?: T) => SpawnResult<T>;
}

export interface CommandDefinition<TInput = unknown, TOutput = unknown, S = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  execute: (
    input: TInput,
    ctx: CommandContext<S>,
  ) => Promise<CommandResult<TOutput>> | CommandResult<TOutput>;
}

export type CommandResult<T = unknown> =
  | ValueResult<T>
  | TransitionResult
  | SpawnResult
  | CedeResult;

export interface ValueResult<T> {
  type: "value";
  value: T;
}

// Type guard
export function isValueResult<T>(r: CommandResult<T>): r is ValueResult<T> {
  return r.type === "value";
}
```

### 2. Node Update (`src/types/node.ts`)

Add to Node interface:
```typescript
commands?: Record<string, AnyCommandDefinition<S>>;
```

### 3. Command Executor (`src/runtime/command-executor.ts`)

```typescript
export async function executeCommand<S>(
  charter: Charter,
  instance: Instance<S>,
  commandName: string,
  input: unknown,
): Promise<CommandExecutionResult<S>> {
  const command = instance.node.commands?.[commandName];
  if (!command) {
    return { success: false, error: `Command not found: ${commandName}` };
  }

  // Validate input
  const parsed = command.inputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: `Invalid input: ${parsed.error.message}` };
  }

  // Track state updates
  let currentState = instance.state;
  const updateState = (patch: Partial<S>) => {
    currentState = deepMerge(currentState, patch);
  };

  // Create context with helpers
  const ctx: CommandContext<S> = {
    state: currentState,
    updateState,
    cede: (payload) => ({ type: "cede", payload }),
    spawn: (node, state) => ({
      type: "spawn",
      children: [{ node, state: state ?? node.initialState }]
    }),
  };

  // Execute
  const result = await command.execute(parsed.data, ctx);

  // Handle result types
  if (isValueResult(result)) {
    // Just state update + value return
    const updatedInstance = { ...instance, state: currentState };
    return { success: true, value: result.value, instance: updatedInstance };
  }

  // Handle transition/spawn/cede...
  // Similar to how StandardExecutor handles transition results
}
```

### 4. Public API (`src/core/commands.ts`)

```typescript
export function getAvailableCommands(machine: Machine): CommandInfo[] {
  const active = getActiveInstance(machine.instance);
  return Object.entries(active.node.commands ?? {}).map(([name, cmd]) => ({
    name,
    description: cmd.description,
    inputSchema: cmd.inputSchema,
  }));
}

export async function runCommand(
  machine: Machine,
  commandName: string,
  input: unknown,
): Promise<{ machine: Machine; result: CommandExecutionResult }> {
  // Execute and rebuild machine with updated instance
}
```

---

## Example Usage

### Defining Commands

```typescript
const mainNode = createNode<TodoState>({
  instructions: "...",
  commands: {
    archiveAll: {
      name: "archiveAll",
      description: "Archive all completed todos",
      inputSchema: z.object({}),
      execute: (_, ctx) => {
        ctx.updateState({
          todos: ctx.state.todos.map(t =>
            t.completed ? { ...t, archived: true } : t
          ),
        });
        return { type: "value", value: { archived: ctx.state.todos.filter(t => t.completed).length } };
      },
    },
    clearAll: {
      name: "clearAll",
      description: "Remove all todos",
      inputSchema: z.object({}),
      execute: (_, ctx) => {
        ctx.updateState({ todos: [] });
        return { type: "value", value: null };
      },
    },
  },
});
```

### Frontend Usage

```typescript
// List available commands
const commands = getAvailableCommands(machine);
// [{ name: "archiveAll", description: "...", inputSchema: {...} }]

// Execute a command
const { machine: updated, result } = await runCommand(machine, "archiveAll", {});
if (result.success) {
  console.log(`Archived ${result.value.archived} todos`);
}
```

---

## Execution Order

1. Create `src/types/commands.ts` - types and interfaces
2. Update `src/types/node.ts` - add commands to Node
3. Create `src/runtime/command-executor.ts` - execution logic
4. Create `src/core/commands.ts` - public API functions
5. Update `src/index.ts` - exports
6. Add tests
7. Update todo app with example command

---

## Open Questions

1. **Should commands inherit from ancestors?** Tools do - should commands follow the same pattern?
2. **Should commands have access to pack state?** Probably yes for consistency.
3. **Should charter define global commands?** Like charter tools?

For now, keeping it simple: commands on current node only, no inheritance.

---

Zack's notes:
- command probably important for external control
- not sure if command list should come off instance or off charter or both? might be weird to have conditionally available commands if its based on instance
- should runCommand be its own call or can you call runMachine with a command input?