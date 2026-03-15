---
variant: "Variant B: Remove extractResultExcerpt(), inline excerpt logic at call sites"
tasks:
  - desc: "Delete extractResultExcerpt() from output.ts, implement multi-line nodeResult()"
    files: ["engine/output.ts"]
  - desc: "Inline excerpt logic at state-persistence call site in engine.ts"
    files: ["engine/engine.ts"]
  - desc: "Inline excerpt logic at loop state-persistence call site in node-dispatch.ts"
    files: ["engine/node-dispatch.ts"]
  - desc: "Update tests: delete extractResultExcerpt tests, add multi-line nodeResult tests"
    files: ["engine/output_test.ts"]
---

## Justification

I selected Variant B because it literally satisfies the acceptance criterion
("extractResultExcerpt() removed") while keeping changes minimal (S effort).
The 3-line excerpt logic (`split → filter → slice → join → truncate`) is
trivially inlined at the 2 state-persistence call sites with negligible DRY
cost — independent evolution of these identical lambdas is unlikely given both
serve the same "compact excerpt for state.json" purpose.

Variant A (rename) would leave the function in `output.ts` under a new name,
creating ambiguity about whether the AC is met. Variant C (extract to new
module) creates 2 new files for a 3-line function — directly violates AGENTS.md
and CLAUDE.md's "avoid premature abstraction" principle: "three similar lines
of code is better than a premature abstraction."

This aligns with the project vision (AGENTS.md): engine stays simple and
domain-agnostic. The change is purely observability (output formatting) with
zero behavioral impact on DAG execution, state persistence, or inter-node
communication.

## Task Descriptions

### Task 1: Delete `extractResultExcerpt()`, implement multi-line `nodeResult()`

Remove `extractResultExcerpt()` export and implementation from `output.ts`.
Rewrite `nodeResult(nodeId, output)` to render multi-line format:
1. Header line: `[HH:MM:SS] <nodeId padded>  RESULT:`
2. Each non-empty line of `output.result` indented with 2 spaces
3. Footer line: `  cost=$X.XXXX | duration=Xs | turns=N`

Still guarded by `verbosity !== "quiet"`.

### Task 2: Inline excerpt logic in `engine.ts`

At the `executeNode()` call site where `extractResultExcerpt(result.output.result)`
is passed to `markNodeCompleted()`, replace with inline lambda:
`text.split("\n").filter(l => l.trim()).slice(0,3).join(" | ").slice(0,400)`.
Remove `extractResultExcerpt` import.

### Task 3: Inline excerpt logic in `node-dispatch.ts`

At the `executeLoopNode()` `onNodeComplete` callback where excerpt is passed
to `markNodeCompleted()`, apply same inline lambda. Remove
`extractResultExcerpt` import.

### Task 4: Update tests

Delete `extractResultExcerpt` test cases from `output_test.ts`. Add tests for
new multi-line `nodeResult()`: empty result, single-line result, multi-line
result (verify header/indent/footer format). Verify quiet-mode suppression
still works.

## Summary

I selected Variant B (delete `extractResultExcerpt()`, inline at 2 call sites)
for literal AC compliance and minimal complexity. I defined 4 ordered tasks:
output.ts rewrite → engine.ts inline → node-dispatch.ts inline → test updates.
I created branch `sdlc/issue-120` and opened a draft PR.
