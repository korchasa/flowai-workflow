---
variant: "Variant A: Inline state in executeClaudeProcess()"
tasks:
  - desc: "Add formatFooter() pure function"
    files: ["engine/agent.ts", "engine/agent_test.ts"]
  - desc: "Add turn separator injection in NDJSON loop"
    files: ["engine/agent.ts", "engine/agent_test.ts"]
  - desc: "Add footer writing after result event"
    files: ["engine/agent.ts", "engine/agent_test.ts"]
  - desc: "Add integration test for turn separators + footer in stream log"
    files: ["engine/agent_test.ts"]
---

## Justification

**Variant A selected** over B (decorator class) and C (post-processing pass).

- **Minimal complexity:** ~30 lines added to existing `executeClaudeProcess()`.
  Aligns with AGENTS.md vision of simplicity — no new abstractions for a small
  feature. Module currently uses free functions; introducing a class (Variant B)
  contradicts established patterns for negligible benefit.
- **Crash-resilience preserved:** Turn separators and footer are written
  incrementally via append (same as existing log writes). Variant C breaks
  append-only semantics by rewriting the entire file post-stream, risking
  corruption on engine crash.
- **Testability:** `formatFooter()` is a pure function (input: `ClaudeCliOutput`,
  output: string). Turn-separator logic depends only on event type check.
  Both unit-testable without Claude CLI — no mocks needed.
- **Effort S** vs M for both alternatives. Fastest path to FR-39 completion.
- **Risk:** `executeClaudeProcess()` grows to ~180 lines. Acceptable — it's the
  single NDJSON processing site and the added logic is linear (counter + two
  write calls).

## Task Descriptions

### Task 1: Add `formatFooter()` pure function

Create `formatFooter(output: ClaudeCliOutput): string` in `engine/agent.ts`.
Returns one-line summary: `status=<ok|error> duration=<X>s cost=$<Y> turns=<N>`.
Derives status from `is_error`, duration from `duration_ms` (converted to
seconds), cost from `total_cost_usd`, turns from `num_turns`. Write unit tests
for normal and error cases.

### Task 2: Add turn separator injection in NDJSON loop

Add `turnCount: number = 0` local variable in `executeClaudeProcess()`. In the
existing NDJSON event processing loop, when `event.type === "assistant"`:
increment `turnCount`, write `--- turn N ---\n` to `logFile` via
`stampLines()` (consistent timestamps). Write unit test verifying separator
appears before each assistant block in stream log output.

### Task 3: Add footer writing after result event

After the existing result event processing in `executeClaudeProcess()`, write
`--- end ---\n` + `formatFooter(output)` line to `logFile` via `stampLines()`.
Footer written once, immediately after result extraction. Write unit test
verifying footer appears at end of stream log.

### Task 4: Add integration test for turn separators + footer in stream log

End-to-end test: simulate multi-turn NDJSON stream (multiple assistant events +
result event), verify stream log file contains correct turn separators
(`--- turn 1 ---`, `--- turn 2 ---`, etc.) and footer (`--- end ---` + summary
line) with timestamps. Verify continuation (append) semantics: two invocations
produce two sets of separators in same file.
