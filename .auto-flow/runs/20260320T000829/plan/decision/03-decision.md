---
variant: "Variant A: Inline stash logic in reset-to-main.sh"
tasks:
  - desc: "Add dirty-check + auto-stash logic to reset-to-main.sh"
    files: [".auto-flow/scripts/reset-to-main.sh"]
  - desc: "Add tests for auto-stash behavior in reset-to-main.sh"
    files: [".auto-flow/scripts/reset-to-main_test.sh"]
---

## Justification

I selected Variant A because it delivers FR-S41 with minimal blast radius:
single-file modification, no new files, no speculative features. This aligns
with AGENTS.md vision: "Domain-agnostic engine" — the stash logic is a
pipeline-level script concern, not engine code. No engine changes needed.

Variant B (separate script) creates a second file for ~20 lines of logic with
exactly one caller — over-engineering per AGENTS.md Planning Rules ("don't
design for future"). Variant C (structured output) adds machine-parseable
format consumed by nothing today — violates the same rule.

Inline stash keeps `reset-to-main.sh` self-contained. The script grows from
~16 to ~30 lines — still compact. `set -euo pipefail` ensures stash failure
aborts the pipeline (fail-fast strategy).

## Task Descriptions

### Task 1: Add dirty-check + auto-stash logic to reset-to-main.sh

Insert before the existing destructive git ops (`git fetch`, `git checkout -f`,
`git reset --hard`, `git clean -fd`):

1. `git status --porcelain` → if non-empty, tree is dirty.
2. Display current branch (`git branch --show-current`) and diff stat
   (`git diff --stat HEAD` + `git diff --stat --cached` + untracked file list).
3. `git stash push --include-untracked -m "auto-flow pre_run: <ISO timestamp>"`.
4. Display confirmation: stash ref (`git stash list -1`), restore command
   (`git stash pop`).
5. If clean → proceed silently (no extra output).

Existing reset logic (fetch, checkout, reset, clean) remains unchanged.

### Task 2: Add tests for auto-stash behavior

Test scenarios per FR-S41 acceptance criteria:
- Dirty tree → stash created, output shows branch + diff stat + restore command.
- Clean tree → no stash, no extra output.
- Post-stash reset behavior unchanged (fetch, checkout, reset, clean still run).

## Summary

I selected Variant A (inline stash logic in `reset-to-main.sh`). Rationale:
single-file change, no over-engineering, fail-fast on stash failure, aligns
with pipeline-level scope separation. 2 tasks: implement stash logic + add
tests. I created branch `sdlc/issue-159` and will open a draft PR.
