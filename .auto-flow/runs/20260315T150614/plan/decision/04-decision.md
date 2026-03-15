---
variant: "Variant B: Keep mod.ts with documented purpose, clean the rest"
tasks:
  - desc: "Add module-level JSDoc to engine/mod.ts documenting its purpose as deno doc --lint entry point"
    files: ["engine/mod.ts"]
  - desc: "Remove redundant run:validate task from deno.json"
    files: ["deno.json"]
  - desc: "Delete superseded HITL research doc documents/rnd/human-in-the-loop.md"
    files: ["documents/rnd/human-in-the-loop.md"]
  - desc: "Mark FR-E26 acceptance criteria in requirements-engine.md"
    files: ["documents/requirements-engine.md"]
---

## Justification

I selected Variant B because `engine/mod.ts` has a legitimate, non-redundant
consumer: `deno doc --lint` in `scripts/check.ts:278` uses the barrel export as
the sole entry point for JSDoc validation and circular dependency detection.
Removing it (Variant A) risks behavioral change — barrel exports give doc-lint
a complete public API surface; individual files may miss cross-module JSDoc
issues. Variant C (dedicated script) adds a new file with the same re-export
pattern in a different location — over-engineering for a housekeeping task.

Variant B aligns with the project vision (AGENTS.md): "Avoid over-engineering.
Only make changes that are directly requested or clearly necessary." The barrel
file serves a real tooling purpose — documenting that purpose is the correct
fix. The `run:validate` task removal and research doc deletion are shared across
all variants and carry zero risk.

## Task Descriptions

### Task 1: Add module-level JSDoc to engine/mod.ts

Add a module-level JSDoc comment explaining that `mod.ts` is the doc-lint entry
point, not a runtime public API. Content:
`/** Barrel re-export for deno doc --lint entry point. Not imported by runtime code. */`
This prevents future contributors from mistaking it for the engine's public API.

### Task 2: Remove run:validate task from deno.json

Delete the `run:validate` task (line ~12 in `deno.json`) which runs
`deno check engine/mod.ts`. This is redundant because `scripts/check.ts:240-248`
already type-checks all individual `.ts` files in `engine/` and `scripts/`.

### Task 3: Delete superseded HITL research doc

Delete `documents/rnd/human-in-the-loop.md` (18KB Russian-language
pre-implementation research for FR-E8). FR-E8 is fully implemented (all ACs
`[x]`). The research doc is superseded by `engine/hitl.ts` + SDS §5 HITL
documentation. Keeping it creates maintenance confusion.

### Task 4: Mark FR-E26 acceptance criteria

Update `documents/requirements-engine.md` §3.26 FR-E26 to mark completed ACs
with `[x]` and evidence references after implementation. AC3 (empty run dirs)
is already resolved — directories exist only on disk, are not git-tracked, and
`.gitignore` covers them.

## Summary

I selected Variant B (keep mod.ts with documented purpose) for its minimal risk
and alignment with the project's anti-over-engineering principle. I defined 4
ordered tasks: JSDoc annotation, deno.json cleanup, stale doc deletion, and
SRS AC marking. I created branch `sdlc/issue-87` and opened a draft PR.
