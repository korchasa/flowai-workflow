---
variant: "Variant A: Extract processStreamEvent() helper function"
tasks:
  - desc: "Define StreamProcessorState interface and processStreamEvent() function"
    files: ["engine/agent.ts"]
  - desc: "Refactor executeClaudeProcess() main loop to call processStreamEvent()"
    files: ["engine/agent.ts"]
  - desc: "Refactor executeClaudeProcess() buffer-remainder block to call processStreamEvent()"
    files: ["engine/agent.ts"]
  - desc: "Add unit tests for processStreamEvent() covering turn counting, tracker warnings, result extraction, footer writing"
    files: ["engine/agent_test.ts"]
  - desc: "Verify all existing tests pass and agent.ts line count is under 500"
    files: ["engine/agent.ts", "engine/agent_test.ts"]
---

## Justification

I selected Variant A for the following reasons:

1. **Function-oriented style consistency.** `engine/agent.ts` currently uses free
   functions and one small utility class (`FileReadTracker`). A helper function
   with a state bag fits naturally. Variant C's class-based approach introduces
   structural overhead disproportionate to a single-use extraction — violating
   the project's "avoid over-engineering" principle (AGENTS.md: "Only make
   changes that are directly requested or clearly necessary").

2. **Lower risk than Variant B.** Variant B's stream flush approach carries
   subtle control-flow risks: reprocessing the buffer within the same loop
   iteration requires careful ordering to avoid double-processing or missed
   events. Edge cases (empty buffer after final chunk) are hard to unit-test
   without mocking `ReadableStreamDefaultReader`. Variant A is a mechanical
   extraction with zero behavioral change.

3. **Testability.** `processStreamEvent()` is a pure-ish function callable
   with synthetic event objects — fully testable without spawning Claude CLI
   or mocking stream readers. This aligns with AGENTS.md's "domain-agnostic"
   engine vision: the extracted function processes generic stream events.

4. **Effort S.** ~30-line function, net ~40-line reduction, achieves the <500
   LOC target. Single commit scope per task.

## Task Descriptions

### Task 1: Define StreamProcessorState interface and processStreamEvent()

Create `StreamProcessorState` interface holding mutable state: `turnCount`,
`resultEvent`, `tracker` (FileReadTracker), `logFile`, `encoder`, `onOutput`
callback, `verbosity`. Export `processStreamEvent(event, state): Promise<void>`
— performs JSON-parsed event processing: turn counting, separator writing,
file-read tracking, result extraction, log writes, footer generation, terminal
output forwarding. ~30 lines.

### Task 2: Refactor main loop to call processStreamEvent()

In `executeClaudeProcess()`, replace the inline event-processing block (lines
~473-524) with: parse JSON → `await processStreamEvent(parsed, state)`. Main
loop body reduces to ~5 lines.

### Task 3: Refactor buffer-remainder block to call processStreamEvent()

Replace the buffer-remainder event-processing block (lines ~528-573) with the
same pattern: parse JSON → `await processStreamEvent(parsed, state)`. Delete
the duplicated inline logic. Net ~40-line reduction.

### Task 4: Add unit tests for processStreamEvent()

Add tests in `engine/agent_test.ts`:
- Turn counting: verify `state.turnCount` increments on `assistant` events.
- FileReadTracker warning: verify warning emitted on repeated `Read` tool_use.
- Result extraction: verify `state.resultEvent` populated on `result` event.
- Footer writing: verify `formatFooter()` output written to log after result.
All tests use synthetic event objects — no CLI spawn needed.

### Task 5: Verify all tests pass and line count target

Run full test suite (`deno task test`). Verify `engine/agent.ts` is under 500
lines via `wc -l`. No behavioral changes — all existing tests must pass
unchanged.

## Summary

I selected Variant A (extract `processStreamEvent()` helper function) for its
best balance of simplicity, testability, and style consistency. I defined 5
dependency-ordered tasks covering interface definition, two-site refactoring,
unit tests, and verification. I created branch `sdlc/issue-91` and opened a
draft PR.
