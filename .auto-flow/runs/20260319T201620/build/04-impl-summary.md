## Summary

### Files Changed

- `engine/config.ts` — Added mutual-exclusivity validation: after existing
  `phases:` block validation, checks for coexisting node-level `phase:` fields;
  throws diagnostic error naming both mechanisms and all affected node IDs.
- `engine/state.ts` — Simplified `setPhaseRegistry()` to clean if/else;
  removed dual-mechanism merge logic.
- `.auto-flow/pipeline.yaml` — Removed 5 redundant per-node `phase:` fields
  that coexisted with top-level `phases:` block.
- `documents/requirements-engine.md` (iteration 2) — Added FR-E33 section
  3.33; updated FR-E9 criterion to reference FR-E33 and remove
  "authoritative/fallback" dual-mechanism language; added FR-E33 row to
  Appendix cross-reference table.

### Tests Added / Modified

- `engine/config_test.ts` — 4 new tests covering FR-E33 scenarios.
- `engine/state_test.ts` — Replaced "top-level phases take priority" test
  (now impossible) with phases-block-only and phase-field-only tests.

### Check Status

`deno task check` — **PASS** (514 tests, 0 failed)
