---
variant: "Variant A: Batch single-pass with pre-verification"
tasks:
  - desc: "Verify evidence pointers for FR-E2, FR-E10, FR-E13, FR-E19 against codebase"
    files: ["documents/requirements-engine.md"]
  - desc: "Batch-update all unmarked ACs: mark [x] with evidence pointers"
    files: ["documents/requirements-engine.md"]
  - desc: "Run deno task check to confirm no regressions"
    files: []
---

## Justification

I selected Variant A for this documentation-only task. The key reasons:

1. **Minimal complexity:** All changes target a single file
   (`documents/requirements-engine.md`). A single editing pass with one commit
   is the cleanest approach — no git noise from per-FR commits (Variant B) and
   no redundant SDS cross-referencing (Variant C, which the spec explicitly
   marks unnecessary since "SDS already reflects current implementation").

2. **Vision alignment:** AGENTS.md establishes that the engine is
   domain-agnostic and pipeline-independent. Evidence marking is a pure
   documentation concern — keeping the process atomic (single pass, single
   commit) respects the principle of minimal overhead for non-code changes.

3. **Risk profile:** FR-E11 evidence was already verified and committed
   (commits `ba99362`, `232dc53`). The remaining 4 FRs (FR-E2, FR-E10, FR-E13,
   FR-E19) follow the same pattern — verify cited line ranges, then mark. Low
   risk of partial implementation since the spec confirms all are fully
   implemented.

## Task Descriptions

### Task 1: Verify evidence pointers

Read each evidence file cited in the spec (`engine/engine.ts`,
`engine/output.ts`, `engine/types.ts`, `engine/config.ts`, `engine/loop.ts`,
`engine/dag.ts`, `.sdlc/pipeline.yaml`) and confirm cited line ranges contain
expected implementation. For any AC where evidence is incorrect or outdated
(line numbers shifted), locate actual implementation and note corrected
evidence.

### Task 2: Batch-update all unmarked ACs

Edit `documents/requirements-engine.md`: change `[ ]` → `[x]` and append
`Evidence: <path:lines>` for all 27 ACs across FR-E2, FR-E10, FR-E13, FR-E19.
Single editing pass, single commit.

### Task 3: Run checks

Execute `deno task check` to confirm no formatting, linting, or test
regressions from the documentation changes.

## Summary

- I selected Variant A (batch single-pass) for its minimal complexity — single file, single commit, zero code changes.
- I defined 3 tasks: evidence verification, batch AC update (27 ACs across 4 FRs), and regression check.
- Branch `sdlc/issue-99` and draft PR #102 already exist from prior work on this issue.
