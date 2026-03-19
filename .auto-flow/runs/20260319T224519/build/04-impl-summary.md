## Summary

### Files Changed

- `.auto-flow/pipeline.yaml` — Removed `prompt:` field from all 6 agent nodes
  (`specification`, `design`, `decision`, `build`, `verify`, `tech-lead-review`).
  Prepended `{{file(".auto-flow/agents/shared-rules.md")}}` + `---` +
  `{{file(".auto-flow/agents/agent-<name>/SKILL.md")}}` + `---` to each node's
  `task_template`, satisfying FR-S38 AC#1–3.

- `engine/pipeline_integrity_test.ts` — Updated the pipeline integrity test:
  changed assertion from "pipeline must have ≥1 prompt file" to "pipeline must
  have 0 prompt files" (FR-S38 AC#3 enforcement). Test count: 533 (was 533).

### Tests Added/Modified

- `engine/pipeline_integrity_test.ts`: test `"pipeline.yaml — no agent node
  uses prompt: field (FR-S38 AC#3)"` — behavioural inversion of prior assertion;
  now validates absence of `prompt:` fields in the reference pipeline.

### Check Status

PASS — 533 tests, 0 failed. All pipeline integrity, HITL, agent-list, and doc
lint checks passed.
