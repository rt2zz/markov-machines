# Terminal Tools: Tool Calls as Machine Responses

## Goal
Allow tool calls to generate the machine's final response, useful for:
- Deterministic responses (exact formatting)
- Structured responses for specific situations
- Avoiding LLM hallucination when output must be exact

## Recommended Approach: `terminal` flag on ToolDefinition

Add an optional `terminal: true` property to tools. When a terminal tool executes successfully, its output becomes the machine response and the turn ends immediately.

### Alternative Approaches Considered

| Approach | Pros | Cons |
|----------|------|------|
| **1. `terminal` flag (recommended)** | Simple API, clear intent, minimal changes | Per-tool, not per-invocation |
| **2. Return `{ terminal: true, value }` from execute** | Per-invocation control | Requires all tools to adopt new return convention |
| **3. `ctx.respond(value)` method** | Similar to `cede()` pattern | More complex, side-effect based |
| **4. Built-in `respond` tool** | Zero changes to tool definition | Response formatting in LLM, not code |

### Why `terminal` flag?
- Matches existing patterns (tools have static properties like `name`, `description`)
- Minimal API surface change
- Clear at definition time which tools are terminal
- Easy to document in system prompt

---

## Implementation Plan

### 1. Extend `ToolDefinition` type
**File:** `packages/markov-machines/src/types/tools.ts:19-31`

```typescript
export interface ToolDefinition<TInput, TOutput, S> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  execute: (input: TInput, ctx: ToolContext<S>) => Promise<TOutput> | TOutput;
  terminal?: boolean;  // NEW: output becomes machine response
}
```

### 2. Extend `ToolExecutionResult`
**File:** `packages/markov-machines/src/runtime/tool-executor.ts:6-9`

```typescript
export interface ToolExecutionResult {
  result: string;
  isError: boolean;
  isTerminal?: boolean;  // NEW
}
```

### 3. Propagate terminal flag in `executeTool`
**File:** `packages/markov-machines/src/runtime/tool-executor.ts:14-48`

Return `isTerminal: tool.terminal === true` in the result.

### 4. Handle terminal tools in executor
**File:** `packages/markov-machines/src/executor/standard.ts:205-454`

Changes in tool processing loop:
1. Track `terminalResponse: string | null`
2. When executing a tool (line ~366), capture result if `isTerminal && !isError`
3. After loop, if `terminalResponse !== null`:
   - Return early with `response: terminalResponse, yieldReason: "end_turn"`
   - Skip transition execution (terminal tool takes precedence, OR transition takes precedence—see edge cases)

### 5. Add terminal tools to system prompt
**File:** `packages/markov-machines/src/executor/standard.ts:519-552`

Add section listing terminal tools with guidance:
```
## Terminal Tools
These tools generate your final response:
- toolName: description

When you call a terminal tool, its output IS your response. Do not add text after calling one.
```

---

## Edge Case Behavior

1. **Multiple terminal tools in same turn**: **Error** — return error result for second terminal tool call
2. **Terminal tool + transition in same turn**: **Transition wins** — terminal tool result goes to message history but doesn't become response; transition executes normally
3. **Terminal tool + error**: Continue normally (don't treat as terminal)
4. **Terminal tool from ancestor/pack**: Allowed — terminal flag works regardless of tool origin

---

## Verification

1. Add test file: `packages/markov-machines/src/__tests__/terminal-tools.test.ts`
2. Test cases:
   - Terminal tool returns its output as machine response
   - Terminal tool errors → normal flow continues
   - Terminal tool + regular tools → terminal wins
   - `yieldReason` is `"end_turn"` after terminal tool
3. Run: `bun test`

---

## Usage Example

```typescript
const formatResult: ToolDefinition<{ items: string[] }, string, State> = {
  name: "formatResult",
  description: "Format items into the final response",
  terminal: true,
  inputSchema: z.object({ items: z.array(z.string()) }),
  execute: ({ items }) => items.map((i, n) => `${n + 1}. ${i}`).join('\n'),
};
```

When called, machine response is exactly:
```
1. Apple
2. Banana
```
