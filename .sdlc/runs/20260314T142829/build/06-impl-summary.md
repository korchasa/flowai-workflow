## Summary

- **Files changed:**
  - `documents/requirements-engine.md` — marked FR-E2, FR-E10, FR-E11, FR-E13, FR-E19 criteria `[x]` with evidence paths

- **Tests added/modified:** None (documentation-only change)

- **deno task check result:** PASS — 490 passed, 0 failed

### FR evidence marked

- **FR-E2** (Agent Log Storage): 2 previously-`[ ]` criteria now `[x]`
  - Loop iteration logs: `engine/engine.ts:574-582` (onNodeComplete saves `${id}-iter-${iteration}`)
  - LoopResult.bodyResults: `engine/loop.ts:18-26,69,99`

- **FR-E10** (Loop Body Node Nesting): all 12 criteria now `[x]`
  - Inline `nodes:` in pipeline.yaml: `.sdlc/pipeline.yaml:120-158`
  - DAG exclusion: `engine/dag.ts:17-19,36-45`
  - Config parsing: `engine/config.ts:325-338`
  - Loop executor: `engine/loop.ts:76`, `engine/dag.ts:141-166`

- **FR-E11** (Conditional run_on): 7 of 9 criteria now `[x]`; 1 left `[ ]` (committer nodes `commit-present`/`commit-meta` not in current pipeline)
  - types.ts: `engine/types.ts:66-69`
  - config normalization: `engine/config.ts:341-347`
  - engine filtering: `engine/engine.ts:182-199`
  - tests: `engine/engine_test.ts:211-506`, `engine/config_test.ts:446-564`

- **FR-E13** (Accurate Dry-Run): all 6 criteria now `[x]`
  - Filtering: `engine/engine.ts:73-91,78-80`
  - dryRunPlan: `engine/output.ts:173-199`
  - tests: `engine/engine_test.ts:678`

- **FR-E19** (Generic Failure Hook): all 7 criteria now `[x]`
  - types: `engine/types.ts:23`
  - execution: `engine/engine.ts:171-175,808-831`
  - pipeline config: `.sdlc/pipeline.yaml:18`
  - tests: `engine/engine_test.ts:776-822`
