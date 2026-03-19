---
variant: "Variant B: Config validation + registry simplification"
tasks:
  - desc: "Add mutual-exclusivity validation in config.ts"
    files: ["engine/config.ts", "engine/config_test.ts"]
  - desc: "Simplify setPhaseRegistry() to exclusive if/else in state.ts"
    files: ["engine/state.ts", "engine/state_test.ts"]
---

## Justification

I selected Variant B because it delivers both the parse-time rejection gate and
the registry cleanup — the two changes are logically coupled and small.

- **Variant A rejected:** Leaves dead fallback merge code in
  `setPhaseRegistry()`. Dead code contradicts the fail-fast, fail-clearly
  strategy (AGENTS.md). If a future change relaxes validation, the silent merge
  behavior reappears without warning — a latent defect.
- **Variant C rejected:** Extracting a dedicated `validatePhaseAssignment()`
  function over-engineers a ~10-line validation check. The existing inline
  validation style in `config.ts` (e.g., `run_on` validation, `run_always`
  normalization) is the established pattern. Extraction changes function
  boundaries and increases merge-conflict risk with no proportional benefit.
- **Variant B aligns with project vision** (AGENTS.md: "engine handles
  execution, validation" + "fail fast, fail clearly"): the validation gate
  enforces single-mechanism at parse time, and the registry simplification
  removes ambiguity from the runtime path. Both changes are tightly scoped to
  `config.ts` and `state.ts` — no cross-module refactoring.

## Task Descriptions

### Task 1: Add mutual-exclusivity validation in config.ts

Add a validation pass after existing `phases:` block structure validation
(line ~128 in `config.ts`). The check detects coexistence of top-level
`phases:` block and any node-level `phase:` field. On detection: throw a
diagnostic error naming both mechanisms and at least one affected node ID.

**Tests (config_test.ts):** 4 new tests:
1. Both `phases:` and per-node `phase:` present → rejection with diagnostic
2. `phases:` block only → accepted
3. Per-node `phase:` only → accepted
4. Neither mechanism → accepted

This task blocks Task 2 — validation must exist before simplifying the registry.

### Task 2: Simplify setPhaseRegistry() in state.ts

Rewrite `setPhaseRegistry()` (lines 24-40 in `state.ts`) to remove the
dual-mechanism merge logic. After Task 1 guarantees mutual exclusivity, the
function becomes a simple if/else:
- If `config.phases` exists: populate registry from `phases:` block
- Else: iterate nodes, populate from per-node `phase:` fields

**Tests (state_test.ts):**
- Update existing "top-level phases take priority over per-node phase" test
  (line ~416) — this scenario is now impossible (config validation rejects it).
  Replace with test verifying phases-block-only registry building.
- Add test for phase-field-only registry building.

## Summary

I selected Variant B (config validation + registry simplification) for issue
#150 (FR-E33). It enforces single-mechanism phase assignment at parse time and
removes the now-dead dual-mechanism merge logic from `setPhaseRegistry()`. 2
tasks ordered by dependency. Branch `sdlc/issue-150` created with draft PR.
