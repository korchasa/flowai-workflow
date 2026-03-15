---
variant: "Variant B: Evidence closure + SDS reference audit"
tasks:
  - desc: "Mark FR-E29 acceptance criteria as [x] with evidence in SRS"
    files: ["documents/requirements-engine.md"]
  - desc: "Verify SDS has no stale stage script references, document finding"
    files: ["documents/design-engine.md"]
  - desc: "Run deno task check to confirm all active tests pass"
    files: []
---

## Justification

I selected Variant B for three reasons:

1. **Spec compliance:** FR-E29 acceptance criteria require evidence marking.
   The legacy `test:pm`, `test:tech-lead`, etc. tasks referencing
   `.sdlc/scripts/stage-*_test.ts` were already removed in a prior migration.
   Current `deno.json` contains only valid test tasks (`test`, `test:lib`,
   `test:engine`). Evidence exists — needs formal marking.

2. **SDS acceptance criterion:** Issue #90's acceptance criteria mention "SDS
   3.2 (Stage Scripts) references updated accordingly." Current SDS §3.2 is
   "Phase Registry" — no Stage Scripts section exists. No references to
   `.sdlc/scripts/stage-*` found in `documents/design-engine.md`. Variant B
   confirms this and documents the finding, satisfying the criterion.

3. **Vision alignment:** AGENTS.md mandates accurate documentation as the only
   link to past decisions ("MEMORY RESETS. DOCS = ONLY LINK TO PAST. MAINTAIN
   ACCURACY"). Closing FR-E29 with proper evidence upholds this principle.
   Variant A skips SDS verification; Variant C exceeds scope boundaries.

## Task Descriptions

### Task 1: Mark FR-E29 acceptance criteria as [x] with evidence

Update `documents/requirements-engine.md` section 3.29 (FR-E29). Mark each
acceptance criterion as `[x]` with evidence:
- Legacy test tasks removed: evidence is current `deno.json` (no
  `.sdlc/scripts/stage-*_test.ts` references present)
- Active tests pass: evidence from `deno task check` execution

### Task 2: Verify SDS has no stale stage script references

Read `documents/design-engine.md`. Confirm:
- No "Stage Scripts" section exists (§3.2 is "Phase Registry")
- No references to `.sdlc/scripts/stage-*` patterns
- Document verification result in commit message

If stale references found (unlikely), remove them. Based on architect's
analysis and my review: SDS is already clean.

### Task 3: Run deno task check

Execute `deno task check` to verify all active tests pass. This provides
evidence for FR-E29 acceptance criterion that active test suite remains healthy
after legacy task removal.

## Summary

I selected Variant B (Evidence closure + SDS reference audit) for its balance
of completeness and scope discipline. 3 tasks defined: SRS evidence marking,
SDS stale-reference verification, and test suite confirmation. I created branch
`sdlc/issue-90` and opened a draft PR.
