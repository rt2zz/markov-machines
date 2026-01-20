# Multi-Active-Leaf Execution Plan

## Overview
Update `runMachine` to execute all active leaf instances (not just the last deepest), enabling parallel logical execution of spawned children while maintaining a single-non-passive-active-leaf constraint.

## Key Concepts
- **Active leaf**: A leaf instance where `flags.suspended !== true`
- **Passive leaf**: An active leaf with `flags.passive === true` (background worker)
- **Non-passive leaf**: An active leaf with `flags.passive !== true` (user-facing)
- **Constraint**: At most 1 non-passive active leaf at any time

## Changes

### 1. Data Model Updates
**Files:** `src/types/instance.ts`, `src/types/transitions.ts`

#### InstanceFlags interface (instance.ts - new)
```typescript
/**
 * Runtime flags for instance execution behavior.
 */
export interface InstanceFlags {
  /** Passive instances run in background; if end_turn, auto-cede */
  passive?: boolean;
  /** Suspended instances are skipped during execution */
  suspended?: boolean;
}
```

#### Instance interface (instance.ts:17-31)
```typescript
export interface Instance<N extends Node<any> = Node> {
  id: string;
  node: N;
  state: NodeState<N>;
  child?: Instance<any> | Instance<any>[];
  packStates?: Record<string, unknown>;
  executorConfig?: StandardNodeConfig;
  /** Runtime execution flags */
  flags?: InstanceFlags;
}
```

#### SpawnTarget (transitions.ts:19-24)
```typescript
export interface SpawnTarget<T = unknown> {
  node: Node<T>;
  state?: T;
  executorConfig?: StandardNodeConfig;
  /** Runtime execution flags for spawned instance */
  flags?: InstanceFlags;
}
```

#### SpawnOptions (transitions.ts:65-68)
```typescript
export interface SpawnOptions {
  executorConfig?: StandardNodeConfig;
  /** Runtime execution flags for spawned instance(s) */
  flags?: InstanceFlags;
}
```

#### createInstance (instance.ts:37-53)
Add `flags` parameter.

### 2. Active Leaf Path Function
**File:** `src/types/instance.ts`

Add new function `getActiveLeafPaths`:
```typescript
/**
 * Get all paths from root to active leaf instances.
 * Active leaves are leaf nodes where flags.suspended !== true.
 * Returns paths in depth-first order for deterministic execution.
 *
 * @returns Array of paths, each path is Instance[] from root to leaf
 */
export function getActiveLeafPaths(instance: Instance): Instance[][] {
  const paths: Instance[][] = [];

  function traverse(inst: Instance, path: Instance[]): void {
    const currentPath = [...path, inst];

    // If no children, this is a leaf
    if (!inst.child) {
      // Only include if not suspended
      if (inst.flags?.suspended !== true) {
        paths.push(currentPath);
      }
      return;
    }

    // Recurse into children
    const children = Array.isArray(inst.child) ? inst.child : [inst.child];
    for (const child of children) {
      traverse(child, currentPath);
    }
  }

  traverse(instance, []);
  return paths;
}
```

### 3. Validation
**File:** `src/core/run.ts` (or new `src/core/validation.ts`)

Add validation function:
```typescript
/**
 * Validate instance tree constraints.
 * @throws Error if more than 1 non-passive active leaf exists
 */
function validateActiveLeaves(instance: Instance): void {
  const paths = getActiveLeafPaths(instance);
  const nonPassiveLeaves = paths.filter(path => {
    const leaf = path[path.length - 1];
    return leaf && leaf.flags?.passive !== true;
  });

  if (nonPassiveLeaves.length > 1) {
    throw new Error(
      `Invalid instance tree: found ${nonPassiveLeaves.length} non-passive active leaves, ` +
      `but at most 1 is allowed. Use flags.passive for background workers.`
    );
  }
}
```

Call this:
1. In `createMachine` (machine.ts)
2. At start of each `runMachine` loop iteration

### 4. Execution Model Update
**File:** `src/core/run.ts`

Modify `runMachine` to execute all active leaf paths:

```typescript
while (steps < maxSteps) {
  steps++;

  // Validate constraints
  validateActiveLeaves(currentInstance);

  // Get all active leaf paths
  const activeLeafPaths = getActiveLeafPaths(currentInstance);

  if (activeLeafPaths.length === 0) {
    throw new Error("No active instances found");
  }

  // Execute each active leaf path and collect results
  const pathResults: Array<{
    path: Instance[];
    result: RunResult;
    isPassive: boolean;
  }> = [];

  for (const path of activeLeafPaths) {
    const activeInstance = path[path.length - 1];
    const ancestors = path.slice(0, -1);
    const isPassive = activeInstance.flags?.passive === true;

    const result = await machine.charter.executor.run(
      machine.charter,
      activeInstance,
      ancestors,
      isPassive ? "" : currentInput,  // Passive nodes don't get user input
      { ...options, history: currentHistory, currentStep: steps, maxSteps },
    );

    pathResults.push({ path, result, isPassive });
  }

  // Merge results and update tree
  // ... (see step 5)
}
```

### 5. Result Merging Logic
**File:** `src/core/run.ts`

**Important**: Tree updates must be handled carefully because multiple results modify the same tree. The approach:
1. Process cedes first (they remove leaves, simplifying the tree)
2. Then process normal updates
3. Re-walk tree to apply updates at correct positions (paths may shift after cedes)

After collecting all path results:

```typescript
// Process results and update instance tree
let updatedInstance = currentInstance;
const allMessages: Message<AppMessage>[] = [];
let overallYieldReason: YieldReason = "end_turn";
let hasCede = false;
let cedePayload: unknown;

for (const { path, result, isPassive } of pathResults) {
  const ancestors = path.slice(0, -1);

  // Handle passive end_turn as auto-cede
  if (isPassive && result.yieldReason === "end_turn") {
    console.warn(
      `[runMachine] Passive instance auto-ceding on end_turn. ` +
      `Instance: ${path[path.length - 1]?.id}`
    );

    // Accumulate messages as summary for parent
    const summary = result.messages.length > 0
      ? `[Passive child completed: ${summarizeMessages(result.messages)}]`
      : `[Passive child completed]`;

    // Rebuild tree without this leaf (like cede)
    updatedInstance = rebuildTreeAfterCede(ancestors, result.packStates);
    allMessages.push(userMessage(summary));
    hasCede = true;
    continue;
  }

  // Handle actual cede
  if (result.yieldReason === "cede") {
    updatedInstance = rebuildTreeAfterCede(ancestors, result.packStates);
    allMessages.push(...result.messages);
    hasCede = true;
    cedePayload = result.cedePayload;
    continue;
  }

  // Normal case: rebuild tree with updated instance
  updatedInstance = rebuildTree(result.instance, ancestors, result.packStates);
  allMessages.push(...result.messages);

  // Determine overall yield reason (any continuation means continue)
  if (result.yieldReason === "tool_use" || result.yieldReason === "max_tokens") {
    overallYieldReason = "tool_use";
  }
}

// If any path needs continuation, overall machine continues
const isFinal = !hasCede && overallYieldReason === "end_turn";

yield {
  instance: updatedInstance,
  messages: allMessages,
  yieldReason: hasCede ? "cede" : overallYieldReason,
  done: isFinal,
  cedePayload,
};
```

### 6. Helper: Message Summary
**File:** `src/core/run.ts`

```typescript
/**
 * Summarize messages for cede payload.
 * Extracts text content for parent context.
 */
function summarizeMessages(messages: Message[]): string {
  const texts: string[] = [];
  for (const msg of messages) {
    for (const block of msg.content) {
      if (block.type === "text") {
        texts.push(block.text.slice(0, 200));  // Truncate long texts
      }
    }
  }
  return texts.join(" | ").slice(0, 500);  // Overall limit
}
```

### 7. Update transition-handler.ts
**File:** `src/runtime/transition-handler.ts`

Update spawn handling to pass `flags`:

```typescript
// In handleTransitionResult, SpawnResult handling:
const newChildren = result.children.map(({ node, state, executorConfig, flags }) =>
  createInstance(
    node,
    state ?? node.initialState,
    undefined,
    undefined,
    executorConfig ?? node.executorConfig,
    flags,
  ),
);
```

### 8. Update createInstance Signature
**File:** `src/types/instance.ts`

```typescript
export function createInstance<N extends Node<any>>(
  node: N,
  state: NodeState<N>,
  child?: Instance<any> | Instance<any>[],
  packStates?: Record<string, unknown>,
  executorConfig?: StandardNodeConfig,
  flags?: InstanceFlags,
): Instance<N> {
  return {
    id: uuid(),
    node,
    state,
    child,
    packStates,
    executorConfig,
    ...(flags ? { flags } : {}),
  };
}
```

## Files Modified

1. `src/types/instance.ts`
   - Add `InstanceFlags` interface
   - Add `flags?: InstanceFlags` to Instance interface
   - Add `getActiveLeafPaths()` function
   - Update `createInstance()` signature to accept `flags`

2. `src/types/transitions.ts`
   - Import `InstanceFlags` from instance.ts
   - Add `flags?: InstanceFlags` to SpawnTarget
   - Add `flags?: InstanceFlags` to SpawnOptions

3. `src/core/run.ts`
   - Add `validateActiveLeaves()` function
   - Add `summarizeMessages()` helper
   - Rewrite main execution loop to:
     - Get all active leaf paths
     - Execute each path
     - Merge results
     - Handle passive auto-cede

4. `src/core/machine.ts`
   - Add validation call in `createMachine()`

5. `src/runtime/transition-handler.ts`
   - Update spawn handling to pass passive/suspended flags

6. `src/core/transition.ts` (if spawn helper exists there)
   - Update spawn helper signature

## Verification

1. **Unit tests** - Add tests in `__tests__/`:
   - Test `getActiveLeafPaths` with various tree structures
   - Test validation throws on multiple non-passive leaves
   - Test passive auto-cede behavior
   - Test suspended instances are skipped
   - Test message accumulation across multiple paths

2. **Type checking**: `bun run --filter markov-machines build` or `bunx tsc --noEmit`

3. **Existing tests**: `bun test` should still pass

4. **Manual test**: Create a scenario with:
   - Parent spawns passive child
   - Both execute in parallel
   - Passive child auto-cedes on completion
   - Messages accumulate correctly
