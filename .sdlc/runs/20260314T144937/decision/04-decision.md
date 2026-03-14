---
variant: "Variant A: Remove obsolete AC"
tasks:
  - desc: "Remove FR-E11 line 271 obsolete AC about committer nodes"
    files: ["documents/requirements-engine.md"]
  - desc: "Mark FR-E11 as fully implemented [x] in SRS header"
    files: ["documents/requirements-engine.md"]
---

## Justification

I selected Variant A because it is the smallest correct change that resolves
the issue cleanly. The obsolete AC (FR-E11 line 271) references `commit-present`
and `commit-meta` nodes that were removed in the FR-S15/FR-26 pipeline redesign.
These are pipeline-specific node names embedded in an engine FR — a scope
violation per AGENTS.md ("engine is domain-agnostic: MUST NOT contain git,
GitHub, branch, PR, or any domain-specific logic"). Removing the AC eliminates
this scope violation and makes FR-E11 fully evidenced.

I rejected Variant B (annotate as N/A) because marking a non-applicable AC as
`[x]` conflates "implemented" with "no longer relevant," creating semantic
ambiguity for future readers. I rejected Variant C (full evidence audit) because
the Architect confirmed all other ACs across all 5 FRs are already `[x]` with
evidence — a full line-number audit adds effort with marginal value and risks
introducing errors from normal line drift.

No SDLC SDS changes are needed — this is a pure `scope: engine` documentation
task. `documents/design-sdlc.md` has no sections referencing the specific
FR-E11 AC being removed.

## Task Descriptions

### Task 1: Remove FR-E11 line 271 obsolete AC

Remove the acceptance criterion at line 271 of `documents/requirements-engine.md`
that reads: "Committer nodes (`commit-present`, `commit-meta`) do NOT run when
pipeline fails (configured as `run_on: success`)." This AC references entities
removed per FR-S15. Git history preserves the line for audit trail.

### Task 2: Mark FR-E11 as fully implemented

With the obsolete AC removed, all remaining FR-E11 ACs are `[x]` with evidence.
Update the FR-E11 section header/status to reflect full implementation. Verify
the Architect's audit: FR-E2, FR-E10, FR-E13, FR-E19 should already be fully
`[x]` — confirm and document any discrepancies found.

## Summary

I selected Variant A (remove obsolete AC) for its minimal scope, correctness,
and elimination of a scope violation in engine FR-E11. I defined 2 tasks: remove
the stale committer-node AC, then mark FR-E11 fully implemented. I created
branch `sdlc/issue-99` and opened draft PR #102.
