---
variant: "Variant A: Batch Single-Pass (All Three FRs + SDS Fix)"
tasks:
  - desc: "Update FR-E5 ACs in requirements-engine.md: rewrite to reflect --config flag design, mark [x] with evidence, strike through SDLC-level ACs"
    files: ["documents/requirements-engine.md"]
  - desc: "Update FR-E7 ACs in requirements-engine.md: split into engine-load validation ([x] with evidence) and SDLC check task (defer to FR-S24)"
    files: ["documents/requirements-engine.md"]
  - desc: "Update FR-E9 ACs #1-3 in requirements-engine.md: mark [x] with evidence from engine/state.ts and engine/engine.ts"
    files: ["documents/requirements-engine.md"]
  - desc: "Fix design-engine.md §3.2 and all stale 'NOT IMPLEMENTED' references: update status to IMPLEMENTED with evidence"
    files: ["documents/design-engine.md"]
---

## Justification

I selected Variant A (Batch Single-Pass) for three reasons:

1. **Efficiency:** S effort vs M for Variant B. All three FRs target the same
   file (`requirements-engine.md`) with independent, non-overlapping sections.
   No inter-FR dependencies — single-pass is safe and optimal.

2. **Completeness over Variant C:** Variant C leaves AC text misaligned with
   implementation reality, which directly contradicts the project vision in
   AGENTS.md: "MEMORY RESETS. DOCS = ONLY LINK TO PAST. MAINTAIN ACCURACY."
   Stale AC text causes downstream agent confusion — the exact problem issue #96
   was opened to fix.

3. **Risk is manageable:** The large file size (~50KB) risk cited in the plan is
   mitigated by targeted edits to specific FR sections. Each FR occupies a
   distinct section with clear boundaries.

## Task Descriptions

### Task 1: FR-E5 AC Rewrite (requirements-engine.md)

Rewrite FR-E5 (Project Directory Structure) acceptance criteria to reflect
engine's config-path-agnostic design:
- "Pipeline config at project root" → reframe to `--config <path>` flag, mark `[x]`.
  Evidence: `engine/cli.ts:7,37`, `engine/config.ts:37`.
- "Run artifacts in gitignored dir" → already true, mark `[x]`.
- "Legacy scripts in scripts/" → strike through (SDLC pipeline convention).
- "deno.json tasks updated" → already done, mark `[x]`.
- "All tests pass" → already true, mark `[x]`.
- "SDS updated" → mark `[x]` after SDS fix in Task 4.

### Task 2: FR-E7 AC Split (requirements-engine.md)

Split FR-E7 (Config Drift Detection) ACs into engine vs SDLC concerns:
- Engine validates config on every `loadConfig()` call: `validateSchema()`
  (`config.ts:32,43`), `validateNode()` per node (`config.ts:71,105`).
  Mark engine ACs `[x]` with evidence.
- Standalone `deno task check:pipeline` → SDLC concern, defer to FR-S24
  (already `[x]` in requirements-sdlc.md). Strike through or annotate.

### Task 3: FR-E9 ACs #1-3 Evidence (requirements-engine.md)

Mark FR-E9 (Run Artifacts Folder Structure) ACs #1-3 `[x]` with evidence:
- `engine/state.ts:20-36` — `setPhaseRegistry()` builds nodeId→phase map.
- `engine/state.ts:98-104` — `getNodeDir()` phase-aware path resolution.
- `engine/engine.ts:135` — `setPhaseRegistry(config)` call at engine init.
- `engine/state.ts:44-46` — `getPhaseForNode()` lookup.
ACs #4-5 remain `[ ]` (end-to-end verification + `deno task check` pass).

### Task 4: SDS Fix (design-engine.md)

Update `design-engine.md`:
- §3.2: Remove "NOT IMPLEMENTED" status, replace with "IMPLEMENTED" + evidence.
- §3.1 (two references): Remove "planned, not yet implemented" text.
- §5 Logic: Remove "NOT IMPLEMENTED" from Phase Registry Init.
Update all sections to reflect that phase registry is fully implemented with
evidence from `engine/state.ts` and `engine/engine.ts`.

## Summary

I selected Variant A (Batch Single-Pass) for its efficiency (S effort) and full
spec compliance — it addresses all three FRs in one pass while maintaining
documentation accuracy per AGENTS.md vision. I defined 4 ordered tasks: 3 SRS
AC updates (FR-E5, FR-E7, FR-E9) + 1 SDS fix. I created branch `sdlc/issue-96`
and opened a draft PR.
