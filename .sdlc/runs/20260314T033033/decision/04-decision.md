---
variant: "Variant A: Inline in executeClaudeProcess()"
tasks:
  - desc: "Add formatFooter() pure function with unit tests"
    files: ["engine/agent.ts", "engine/agent_test.ts"]
  - desc: "Add turn separator logic (turnCount + assistant event detection) with unit tests"
    files: ["engine/agent.ts", "engine/agent_test.ts"]
  - desc: "Add end separator + footer write after result event with integration test"
    files: ["engine/agent.ts", "engine/agent_test.ts"]
---

## Justification

**Variant A selected.** Rationale:

1. **Minimal complexity:** ~15 lines of new logic in existing event-processing
   loop. No new modules, no new abstractions. Aligns with AGENTS.md vision of
   keeping the engine simple and domain-agnostic — turn separators are a
   logging concern internal to `executeClaudeProcess()`, not a new subsystem.

2. **Follows existing patterns:** `executeClaudeProcess()` already owns stream
   log writes via `stampLines()` (FR-33). Adding turn markers and footer in the
   same function maintains co-location of all log-write logic.

3. **Spec defers extensibility:** FR-39 spec explicitly defers separator format
   changes (richer delimiters, JSON wrappers). Variant B's `StreamLogWriter`
   class and Variant C's callback injection are premature abstractions for
   requirements that may never materialize.

4. **Risk profile:** Variant A touches 2 files (S effort). Variants B/C touch
   4 files (M effort) and introduce refactoring risk to the working stream log
   path. The added indirection of B/C increases maintenance surface without
   current benefit.

**Rejected:**
- **Variant B** (extract module): Premature abstraction. `executeClaudeProcess()`
  is private, not expected to grow. Two new files increase maintenance surface.
- **Variant C** (callback): Over-engineered for current requirements. Callback
  indirection makes already-complex function harder to follow.

## Task Descriptions

### Task 1: Add `formatFooter()` pure function with unit tests

Export `formatFooter(output: ClaudeCliOutput): string` from `engine/agent.ts`.
Pure function mapping CLI output to footer string:
`status=<ok|error> duration=<X>s cost=$<Y> turns=<N>`.

- `status`: `"ok"` when `!is_error`, `"error"` otherwise.
- `duration`: `duration_ms / 1000`, integer seconds.
- `cost`: `total_cost_usd`, 4 decimal places.
- `turns`: `num_turns`.

Unit tests (RED→GREEN):
- Success case: all fields populated → correct format string.
- Error case: `is_error=true` → `status=error`.
- Zero-cost edge case: `total_cost_usd=0` → `cost=$0.0000`.

### Task 2: Add turn separator logic with unit tests

In `executeClaudeProcess()`:
- Add `let turnCount = 0` before stdout reader loop.
- Inside event processing: on `event.type === "assistant"`, increment
  `turnCount`, write `stampLines("--- turn " + turnCount + " ---") + "\n"`
  to `logFile`.

Unit tests:
- Turn counter increments on each assistant event.
- Separator lines include correct turn number.
- Non-assistant events do not produce separators.

### Task 3: Add end separator + footer write with integration test

After `resultEvent` extraction (post-loop):
- Write `stampLines("--- end ---") + "\n"` to `logFile`.
- Write `stampLines(formatFooter(resultEvent)) + "\n"` to `logFile`.

Tests:
- Footer format matches spec pattern.
- Missing result event: no footer written (existing throw behavior).
- Multi-continuation log: turnCount persists across buffer flushes.
