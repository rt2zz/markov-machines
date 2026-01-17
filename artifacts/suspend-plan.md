# Suspend/Resume Implementation Plan

Add the ability for tools and commands to suspend execution and resume later with a payload - enabling HITL workflows, approval flows, and long-running async operations.

## Key Design Decisions

- **Multiple suspensions allowed**: When Claude calls multiple tools, each can suspend independently
- **Commands included**: Both tools and commands can suspend
- **Storage on Instance**: Suspension state stored on Instance for clean serialization

---

## Phase 1: New Types

### Create `/packages/markov-machines/src/types/suspend.ts`

```typescript
export type SuspendId = string;

export interface SuspendedCall {
  id: SuspendId;
  callId: string;           // tool_use ID or command name
  callType: "tool" | "command";
  name: string;
  input: unknown;
  metadata?: unknown;
  suspendedAt: string;      // ISO 8601
}

export interface SuspendResult {
  type: "suspend";
  id: SuspendId;
  metadata?: unknown;
}

export interface ResumeInput {
  type: "resume";
  suspendId: SuspendId;
  payload: unknown;
  isError?: boolean;
}

// Multiple suspensions possible
export interface SuspensionState {
  suspendedCalls: SuspendedCall[];
  completedToolResults: Array<{
    toolUseId: string;
    content: string;
    isError?: boolean;
  }>;
  assistantMessage?: Message;  // Only for tool suspensions
  priorMessages: Message[];
}

// Type guards
export function isSuspendResult(value: unknown): value is SuspendResult
export function isResumeInput(value: unknown): value is ResumeInput
```

### Modify `/packages/markov-machines/src/types/tools.ts`

Add `suspend` method to `ToolContext`:

```typescript
export interface ToolContext<S = unknown> {
  state: S;
  updateState: (patch: Partial<S>) => void;
  suspend: (metadata?: unknown) => SuspendResult;  // NEW
}
```

### Modify `/packages/markov-machines/src/types/commands.ts`

Add `suspend` method to `CommandContext` and `SuspendResult` to `CommandResult`:

```typescript
export interface CommandContext<S = unknown> {
  state: S;
  updateState: (patch: Partial<S>) => void;
  cede: <P = unknown>(payload?: P) => CedeResult<P>;
  spawn: <T = unknown>(...) => SpawnResult<T>;
  suspend: (metadata?: unknown) => SuspendResult;  // NEW
}

export type CommandResult<T = unknown> =
  | ValueResult<T>
  | TransitionToResult
  | SpawnResult
  | CedeResult
  | SuspendResult;  // NEW
```

### Modify `/packages/markov-machines/src/types/instance.ts`

Add optional suspension field:

```typescript
export interface Instance<N extends Node<any> = Node> {
  id: string;
  node: N;
  state: NodeState<N>;
  child?: Instance<any> | Instance<any>[];
  packStates?: Record<string, unknown>;
  executorConfig?: Record<string, any>;
  suspension?: SuspensionState;  // NEW
}
```

### Modify `/packages/markov-machines/src/executor/types.ts`

Add "suspend" yield reason and suspension field:

```typescript
export interface RunResult {
  response: string;
  instance: Instance;
  messages: Message[];
  yieldReason: "end_turn" | "tool_use" | "max_tokens" | "cede" | "suspend";  // ADD suspend
  cedePayload?: unknown;
  packStates?: Record<string, unknown>;
  suspension?: SuspensionState;  // NEW
}

export interface MachineStep {
  instance: Instance;
  messages: Message[];
  yieldReason: "end_turn" | "tool_use" | "cede" | "max_tokens" | "command" | "suspend";  // ADD suspend
  response: string;
  done: boolean;
  cedePayload?: unknown;
  suspension?: SuspensionState;  // NEW
}
```

---

## Phase 2: Tool Execution Changes

### Modify `/packages/markov-machines/src/runtime/tool-executor.ts`

1. Add `suspended?: SuspendResult` to `ToolExecutionResult`
2. Add `toolUseId` parameter to `executeTool`
3. Create `suspend` method in context that returns `SuspendResult`
4. Detect if tool returns or calls `suspend()`

```typescript
export interface ToolExecutionResult {
  result: string;
  isError: boolean;
  suspended?: SuspendResult;  // NEW
}

export async function executeTool<S>(
  tool: AnyToolDefinition<S>,
  input: unknown,
  state: S,
  onStateUpdate: (patch: Partial<S>) => void,
  toolUseId: string,  // NEW - needed for suspension tracking
): Promise<ToolExecutionResult>
```

### Modify `/packages/markov-machines/src/executor/standard.ts`

1. **Tool processing loop**: Process ALL tools, collect suspensions
   - Track suspended tools in `suspendedCalls: SuspendedCall[]`
   - Non-suspended tools add to `toolResults` as normal
   - At end, if `suspendedCalls.length > 0`, build `SuspensionState`

2. **Add resume handling**:
   - Add optional `resumeInput?: ResumeInput` parameter to `run()`
   - At start of `run()`, check if instance has suspension and resumeInput provided
   - Validate `resumeInput.suspendId` matches one of the suspended calls
   - Build tool result from resume payload
   - Remove that suspension from the list
   - If more suspensions remain, continue suspended state
   - If all resolved, continue normal execution

3. **Build suspension state**:
   ```typescript
   if (suspendedCalls.length > 0) {
     const suspension: SuspensionState = {
       suspendedCalls,
       completedToolResults: toolResults.map(...),
       assistantMessage,
       priorMessages: options?.history ?? [],
     };
     return { ..., yieldReason: "suspend", suspension };
   }
   ```

---

## Phase 3: Command Execution Changes

### Modify `/packages/markov-machines/src/runtime/command-executor.ts`

1. Add `suspend` method to context
2. Handle `SuspendResult` return type
3. Build command-specific suspension state (no assistantMessage needed)

---

## Phase 4: Run Loop Changes

### Modify `/packages/markov-machines/src/core/run.ts`

1. **Extend `RunMachineInput`**:
   ```typescript
   export type RunMachineInput = string | Command | ResumeInput;
   ```

2. **Handle `ResumeInput`**:
   - Validate active instance has suspension
   - Pass to executor with `resumeInput` parameter
   - After resume, check if more suspensions remain
   - If all resolved and `yieldReason !== "suspend"`, continue loop

3. **Handle "suspend" yield reason**:
   - Rebuild tree with suspension attached to instance
   - Yield step with `done: false` and `suspension` details
   - Return from generator (caller must resume)

---

## Phase 5: Serialization

### Modify `/packages/markov-machines/src/serialization/serialize.ts`

Add suspension to `SerializedInstance`:

```typescript
export interface SerializedInstance {
  // ... existing fields ...
  suspension?: SuspensionState;
}
```

Include in `serializeInstance()`.

### Modify `/packages/markov-machines/src/serialization/deserialize.ts`

Restore suspension in `deserializeInstance()`.

---

## Phase 6: Exports and Tests

### Modify `/packages/markov-machines/index.ts`

Export new types:
```typescript
export type { SuspendId, SuspendedCall, SuspendResult, ResumeInput, SuspensionState } from "./src/types/suspend.js";
export { isSuspendResult, isResumeInput } from "./src/types/suspend.js";
```

### Create `/packages/markov-machines/src/__tests__/suspend.test.ts`

Test cases:
1. Single tool suspension and resume
2. Multiple tools - one suspends, others complete
3. Multiple tools - multiple suspend
4. Resume with wrong ID (error)
5. Resume non-suspended instance (error)
6. Command suspension and resume
7. Serialization/deserialization of suspended instance
8. Resume with error payload

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/types/suspend.ts` | NEW - Core suspend/resume types |
| `src/types/tools.ts` | Add `suspend` to `ToolContext` |
| `src/types/commands.ts` | Add `suspend` to `CommandContext`, `SuspendResult` to `CommandResult` |
| `src/types/instance.ts` | Add `suspension?: SuspensionState` |
| `src/executor/types.ts` | Add "suspend" yield reason, `suspension` field |
| `src/runtime/tool-executor.ts` | Handle suspend in tool execution |
| `src/executor/standard.ts` | Collect suspensions, handle resume |
| `src/runtime/command-executor.ts` | Handle suspend in command execution |
| `src/core/run.ts` | Handle `ResumeInput`, "suspend" yield reason |
| `src/serialization/serialize.ts` | Include suspension |
| `src/serialization/deserialize.ts` | Restore suspension |
| `index.ts` | Export new types |
| `src/__tests__/suspend.test.ts` | NEW - Tests |

---

## Usage Example

```typescript
// Tool that suspends for approval
const requestRefund = {
  name: "request_refund",
  inputSchema: z.object({ orderId: z.string(), amount: z.number() }),
  execute: async (input, ctx) => {
    const approvalId = await createApprovalRequest(input);
    return ctx.suspend({ approvalId });
  },
};

// Running and handling suspension
for await (const step of runMachine(machine, userInput)) {
  if (step.yieldReason === "suspend") {
    // Persist and wait for external resolution
    await db.saveSuspended(serializeMachine(machine), step.suspension);
    return;
  }
}

// Later, resume with approval result
const resumeInput: ResumeInput = {
  type: "resume",
  suspendId: "...",
  payload: { approved: true },
};
for await (const step of runMachine(machine, resumeInput)) {
  // Continues execution with approval result as tool output
}
```
