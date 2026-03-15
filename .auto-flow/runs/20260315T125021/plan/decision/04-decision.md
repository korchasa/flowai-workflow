---
variant: "Variant A: Minimal targeted edits"
tasks:
  - desc: "Update verbosity count from 3 to 4 and list all 4 levels in README.md"
    files: ["README.md"]
  - desc: "Add -s/--semi-verbose to CLI flags section in README.md"
    files: ["README.md"]
  - desc: "Verify project structure and agent list sections are correct; document as no-op if accurate"
    files: ["README.md"]
---

## Justification

I selected Variant A because the Architect's analysis confirmed that only 2 of 4 spec items are actually stale: verbosity count (says 3, should be 4) and missing `-s`/`--semi-verbose` CLI flag. Items 1 (project structure) and 2 (agent list) were verified as already correct in the current README.

This aligns with the project vision in AGENTS.md: the project follows "fail fast, fail clearly" and avoids unnecessary changes. Variant B would make idempotent writes to already-correct sections, adding git noise with zero value. Variant C risks scope creep beyond issue #85's defined boundaries.

Complexity is minimal (effort S) — two targeted text edits in a single file.

**SDS update: not applicable.** The spec explicitly scopes out SDS changes ("documents/design-sdlc.md changes — SDS not affected by this issue"). README content accuracy is governed by FR-S14 ACs in the SRS, not by system design. No architectural or component changes result from this fix.

## Task Descriptions

### Task 1: Update verbosity count and level list

Change `README.md` verbosity reference from "3 verbosity levels (`-q` / default / `-v`)" to "4 verbosity levels (`-q` / default / `-s` / `-v`)". Location: around line 27 (verify against actual file content, not spec line numbers which may be stale).

### Task 2: Add `-s`/`--semi-verbose` to CLI flags

Insert `-s, --semi-verbose` line into the CLI flags section of `README.md`. Description should match `engine/cli.ts:12`: "Show text output only (suppress tool calls)". Place between `-q` and `-v` for logical ordering by verbosity level.

### Task 3: Verify project structure and agent list

Read the project structure section and agent list section of `README.md`. Confirm they show `engine/` (not `.sdlc/engine/`) and list exactly 7 agents (PM, Architect, Tech Lead, Developer, QA, Tech Lead Review, Meta-Agent) with no deprecated agents. If already correct, document as no-op in commit message. If stale, fix.

## Summary

I selected Variant A (minimal targeted edits) for its precision — only confirmed-stale content gets changed, avoiding unnecessary git noise. I defined 3 tasks: update verbosity count to 4, add `-s` flag to CLI docs, and verify/confirm the 2 already-correct sections. I created branch `sdlc/issue-85` and opened a draft PR. No SDS update needed — this is a README content fix with no design implications.
