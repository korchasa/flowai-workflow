---
variant: "Variant B: Log line + integration-style tests via executePostPipeline"
tasks:
  - desc: "Add info log at on_error: continue branch in engine.ts"
    files: ["engine/engine.ts"]
  - desc: "Add 5 FR-E34 interaction tests in engine_test.ts"
    files: ["engine/engine_test.ts"]
  - desc: "Update SDS design-engine.md with FR-E34 log spec and interaction rules"
    files: ["documents/design-engine.md"]
  - desc: "Mark FR-E34 acceptance criteria in requirements-engine.md"
    files: ["documents/requirements-engine.md"]
  - desc: "Run deno task check to verify zero warnings/errors"
    files: []
---

## Justification

I selected Variant B because it delivers the optimal trade-off between test
evidence strength and implementation scope:

1. **All ACs covered with evidence.** Variant A leaves AC #2/#3 (hook
   invocation conditions) with thin test evidence — unit tests mock
   `executeNode` but don't exercise `pipelineSuccess` derivation. Variant B
   tests wire `executePostPipeline` with real `OutputManager` capture and
   simulate the `executeLevel` loop pattern, proving the `pipelineSuccess`
   derivation that ACs #2/#3 depend on.

2. **No unnecessary refactoring.** Variant C introduces a `NodeExecResult`
   structured type replacing the boolean return from `executeNode`. Per
   AGENTS.md Key Decisions, the engine is domain-agnostic and
   pipeline-independent — the current boolean flow already produces correct
   `pipelineSuccess` values. The structured result only materializes benefit if
   future FRs need suppressed-vs-successful distinction at pipeline level.
   Over-engineering violates the project vision of minimal, focused changes.

3. **Stays within existing code structure.** The log line addition is a single
   `this.output.status()` call (~1 line). Tests use existing test patterns
   (mocked `executeNode`, real `OutputManager`). No new types, no signature
   changes, no cross-module refactoring.

## Task Descriptions

### Task 1: Add info log at `on_error: continue` branch

Add `this.output.status()` log line in `engine.ts` at the `on_error: continue`
branch (~line 384) before `return true`. Log format:
`[INFO] node <id>: failure suppressed by on_error: continue`. This satisfies
AC #1 (deterministic log message identifying which mechanism took effect).

### Task 2: Add 5 FR-E34 interaction tests

Add test group in `engine_test.ts` exercising `executePostPipeline` with mocked
`executeNode` simulating both continue-d and fatal failure outcomes:

1. Single continue-d failure → log message emitted + hook NOT called.
2. All failures continue-d → `pipelineSuccess === true` → hook NOT called.
3. One fatal failure among continue-d ones → hook called exactly once.
4. Hook script fails after continue-d failure → no re-trigger.
5. Log message format matches `[INFO] node <id>: failure suppressed...`.

Tests assert `pipelineSuccess` derivation logic by replicating the
`executeLevel` loop pattern. Real `OutputManager` capture verifies log output.

### Task 3: Update SDS with FR-E34 log spec

Expand §5 Logic FR-34 section to include: log message format, interaction rules
(4 deterministic rules from SRS), and test strategy. Update §6 Non-Functional
fault description.

### Task 4: Mark FR-E34 acceptance criteria

After implementation, mark ACs `[x]` with evidence (file paths + line numbers).
Blocking: tasks 1-2 must complete first.

### Task 5: Run `deno task check`

Verify zero warnings/errors after all changes. Non-blocking verification step.

## Summary

I selected Variant B (log line + integration-style tests via
`executePostPipeline`). It provides strong test evidence for all 4 behavioral
ACs without over-engineering. 5 tasks ordered by dependency: log line → tests →
SDS → SRS → check. Branch `sdlc/issue-152` created with draft PR.
