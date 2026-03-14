---
variant: "Variant B: Extract agent-node + loop-node executors only"
tasks:
  - desc: "Create engine/node-dispatch.ts with NodeExecutionContext interface and executeAgentNode() free function"
    files: ["engine/node-dispatch.ts", "engine/engine.ts"]
  - desc: "Extract executeLoopNode() to engine/node-dispatch.ts"
    files: ["engine/node-dispatch.ts", "engine/engine.ts"]
  - desc: "Update Engine.executeNode() dispatch to import from node-dispatch, remove inlined methods"
    files: ["engine/engine.ts", "engine/mod.ts"]
  - desc: "Update engine tests for new module structure, verify all pass"
    files: ["engine/engine_test.ts"]
  - desc: "Run deno task check, verify engine.ts ≤500 LOC"
    files: []
---

## Justification

I selected Variant B because it achieves the ≤500 LOC target (~477 lines) with
the smallest change surface and lowest risk. The complexity-based split extracts
only the two complex executors (`executeAgentNode` 108 lines,
`executeLoopNode` 52 lines) while keeping trivial ones inline
(`executeMergeNode` 20 lines, `executeHumanNode` 20 lines).

This aligns with the project vision (AGENTS.md): "avoid over-engineering" — the
engine should remain maintainable without unnecessary abstraction. The split
follows a principled boundary: complex executors with HITL/continuation/logging
complexity go to `node-dispatch.ts`; trivial pass-through handlers stay in
`engine.ts`. If future growth pushes engine.ts back toward 500, Variant A's
full extraction applies incrementally.

Variant A's risk of a "bag of parameters" anti-pattern (6+ fields per call) is
avoided — merge/human don't need hitlConfig, verbosity, etc., so the interface
surface stays smaller. Variant C's over-extraction risk (Engine at ~370 LOC
becoming a thin shell) is also avoided.

## Task Descriptions

### Task 1: Create engine/node-dispatch.ts with executeAgentNode()

I create `engine/node-dispatch.ts` with a `NodeExecutionContext` interface
capturing the shared state needed by extracted executors (state, config, output
helpers, buildContext callback, options). I move `executeAgentNode()` (108 lines)
from `Engine` class to a free function accepting this context. The function
retains all existing behavior: Claude CLI invocation, continuation loop,
validation, HITL detection (delegating to `hitl-handler.ts`), and stream logging.

### Task 2: Extract executeLoopNode()

I move `executeLoopNode()` (52 lines) to `engine/node-dispatch.ts` as a second
free function. It receives the same `NodeExecutionContext` plus loop-specific
config (body nodes, max iterations, exit condition). The loop's internal
topo-sort and body-node execution remain unchanged.

### Task 3: Update Engine dispatch and exports

I update `Engine.executeNode()` switch statement to import and call the extracted
functions from `node-dispatch.ts`, passing the context interface. I remove the
now-dead private methods from Engine class. I update `engine/mod.ts` if any new
public types need exporting (the `NodeExecutionContext` interface may be useful
for testing).

### Task 4: Update tests

I verify all existing tests in `engine/engine_test.ts` pass without modification
— tests use the public `run()` API and should be transparent to internal
restructuring. I add targeted unit tests for the extracted free functions if
any edge cases benefit from direct testing.

### Task 5: Lint and LOC verification

I run `deno task check` to confirm zero warnings/errors. I verify `engine.ts`
line count is ≤500. All behavioral tests pass.

## Summary

- I selected Variant B (agent+loop executors only) for its minimal change surface and principled complexity-based split boundary
- I defined 5 tasks: create node-dispatch module, extract 2 complex executors, update dispatch + exports, verify tests, lint/LOC check
- I created branch `sdlc/issue-92` and opened draft PR #106
