# Markov-Machines Code Review: Part 3+ (Code Quality Improvements)

## Overview

This document captures code quality improvements identified during the review. These are non-critical enhancements for readability, terseness, performance, and type safety.

---

## Readability

### 1. Extract Magic Strings to Constants
**File**: `src/runtime/tool-call-processor.ts`
**Status**: Partially done (lines 22-24)
**Remaining**: Some literals still inline

```typescript
// Already defined:
const TOOL_UPDATE_STATE = "updateState";
const TOOL_TRANSITION = "transition";
const TRANSITION_PREFIX = "transition_";

// Could also extract:
const PACK_STATE_ERROR_PREFIX = "Pack state validation failed: ";
```

---

### 2. Consolidate Child Array Handling
**Files**: Multiple files handle `Instance.child` which is `Instance | Instance[] | undefined`

**Proposal**: Create helper function:
```typescript
// src/types/instance.ts
export function getChildren(inst: Instance): Instance[] {
  if (!inst.child) return [];
  return Array.isArray(inst.child) ? inst.child : [inst.child];
}
```

**Usage sites to update**:
- `src/core/run.ts:49, 51, 99-106, 184, 199, 208`
- `src/types/instance.ts` (various traversal functions)

**Note**: If #9 (rename to `children` with always-array) is implemented, this helper simplifies to just `inst.children ?? []`.

---

### 3. Document Passive Node Constraints
**File**: `src/types/instance.ts` or node definition types

**Constraints to document**:
- Passive nodes don't receive user input
- Passive nodes can't access pack states
- Passive nodes should cede or suspend to return control
- Passive end_turn doesn't propagate to machine

```typescript
/**
 * A passive instance is one that was spawned in parallel alongside other
 * instances. Passive instances have these constraints:
 * - Don't receive user input (get empty string)
 * - Can't update pack states (changes would conflict)
 * - Should cede() to return control to parent
 * - end_turn from passive doesn't end the machine turn
 */
```

---

## Terseness

### 4. Simplify Pack State Access Pattern
**File**: `src/runtime/tool-call-processor.ts:149`

```typescript
// Current:
const packState = packStates[packName] ?? pack.initialState;

// Could have helper (if used in multiple places):
function getPackState(
  packStates: Record<string, unknown>,
  pack: Pack,
): unknown {
  return packStates[pack.name] ?? pack.initialState;
}
```

**Note**: Only worth doing if pattern appears multiple times.

---

### 5. Remove Redundant Type Assertions
**File**: `src/core/run.ts:364`

```typescript
// Current:
rest as Instance

// Could use type predicate or narrow via check
```

Multiple `as unknown as X` casts could be replaced with runtime checks, but adds overhead. Consider case-by-case.

---

## Type Safety

### 8. Discriminated Union for Transition Types
**Files**: `src/types/transitions.ts`, `src/types/refs.ts`

**Current**: Duck-typing with `isCodeTransition`, `isSerialTransition`, etc.
**Proposal**: Add discriminator field

```typescript
interface CodeTransition<S> {
  type: "code";
  description: string;
  execute: (state: S, ctx: TransitionContext) => ...;
}

interface SerialTransition {
  type: "serial";
  description: string;
  node: Ref | SerialNode;
}

interface GeneralTransition {
  type: "general";
  description: string;
}

type Transition<S> = CodeTransition<S> | SerialTransition | GeneralTransition | Ref;
```

**Benefit**: Eliminates unsafe casts, enables exhaustiveness checking
**Cost**: Breaking change to transition API

---

### 9. Rename `child` to `children` and Always Use Array
**Current**: `child?: Instance | Instance[]`
**Proposal**: Rename to `children` and always use array type

```typescript
// Before:
child?: Instance | Instance[];

// After:
children?: Instance[];
```

**`spawn()` API**: The spawn method should accept either a single child or an array for convenience:
```typescript
// Both valid:
ctx.spawn(singleNode);
ctx.spawn([nodeA, nodeB]);

// Internal normalization:
const children = Array.isArray(input) ? input : [input];
```

**Benefits**:
- Eliminates `Array.isArray()` checks throughout codebase
- Clearer semantics (`children` plural implies collection)
- Spawn API remains ergonomic for single-child case

**Cost**: Breaking change to Instance type and all usages

---

## Priority Ranking

### High Value / Low Effort
1. #6 - findInstanceById short-circuit (performance, no breaking changes)
2. #2 - getChildren helper (readability, no breaking changes) — becomes trivial if #9 done first
3. #3 - Document passive constraints (clarity, no breaking changes)

### Medium Value / Medium Effort
4. #1 - Extract remaining magic strings
5. #4 - Pack state helper (if repeated)
6. #5 - Audit type assertions

### High Value / High Effort (Breaking Changes)
7. #8 - Discriminated union for transitions
8. #9 - Rename `child` → `children`, always-array type

### Low Priority
9. #7 - Lazy pack state init (unlikely to matter in practice)
