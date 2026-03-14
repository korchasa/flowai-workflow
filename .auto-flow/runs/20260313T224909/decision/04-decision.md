---
variant: "Variant A: Verify-and-Close"
tasks:
  - desc: "Run deno task test — confirm all 434+ engine tests pass"
    files: []
  - desc: "Run deno task check — confirm zero lint/format/type errors"
    files: []
  - desc: "Audit FR-27 acceptance criteria evidence paths against actual code"
    files: ["documents/requirements.md"]
  - desc: "Close issue #21 with verification summary"
    files: []
---

## Justification

FR-27 (Per-Node Model Configuration) is **fully implemented and merged** (PR
#34). Evidence:

- `engine/types.ts:21,39` — `model?` field on `PipelineDefaults` and
  `NodeConfig`
- `engine/config.ts:304-359` — parses model from defaults/node configs,
  `mergeDefaults()` resolves chain
- `engine/agent.ts:309-311` — `buildClaudeArgs()` emits `--model` on fresh
  invocations only; omits on `--resume`
- `engine/loop.ts:76-92` — body node model resolution: own → loop → defaults
- `.sdlc/pipeline.yaml:15,65,84,147` — `defaults.model: claude-sonnet-4-6` +
  per-node `claude-opus-4-6` overrides
- `engine/agent_test.ts:207-241` — 4 unit tests covering fresh/resume/absent
  model scenarios

**Why Variant A over B/C:**

- **Variant B (Integration Test):** Over-tests already-verified behavior. 4
  existing unit tests cover the model resolution chain (fresh, resume, absent,
  override). Integration test would couple to `pipeline.yaml` structure,
  increasing maintenance burden. Diminishing returns.
- **Variant C (Model Validation):** Spec explicitly marks model validation as
  **out of scope** for issue #21. Anthropic model naming may change (non-
  `claude-*` models). Scope creep — should be separate issue if desired.

**Vision alignment (AGENTS.md):** "Fully autonomous, no human gates between
stages." Variant A closes the loop fastest with zero risk of regression. No
unnecessary code changes preserve the engine's domain-agnostic invariant
(Key Decision: "Engine MUST NOT contain domain-specific logic").

## Task Descriptions

### Task 1: Run test suite
Execute `deno task test`. Confirm all 434+ tests pass. No changes needed —
verification only.

### Task 2: Run check suite
Execute `deno task check`. Confirm zero lint/format/type errors across
codebase.

### Task 3: Audit FR-27 evidence
Cross-reference each `[x]` acceptance criterion in `documents/requirements.md`
(section 3.27) against actual source. Verify file:line citations match current
code.

### Task 4: Close issue
Post verification summary to issue #21 via `gh issue close 21 --comment "..."`.
Include test pass count, check result, and acceptance criteria audit outcome.
