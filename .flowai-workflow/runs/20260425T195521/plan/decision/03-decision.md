---
variant: "Variant A: Process-level env injection"
tasks:
  - desc: "Add `claude_cli_version?: string` to `RunState` in types.ts"
    files: ["types.ts"]
  - desc: "Create `spawn-env.ts` with `buildEngineEnv()` helper and `captureCliVersion()` function"
    files: ["spawn-env.ts"]
  - desc: "Create `spawn-env_test.ts` with unit tests for always-wins and user-merge semantics"
    files: ["spawn-env_test.ts"]
  - desc: "Wire `buildEngineEnv()` + `captureCliVersion()` into engine startup in `engine.ts`"
    files: ["engine.ts"]
  - desc: "Add `state_test.ts` roundtrip test for `claude_cli_version` field"
    files: ["state_test.ts"]
  - desc: "Run `deno task check` to verify all tests pass (AC6)"
    files: []
---

## Justification

I selected **Variant A** (process-level env injection via `Deno.env.set()`) for
these reasons:

1. **Minimal complexity, all ACs in-repo.** Variant B requires cross-repo
   library changes (`@korchasa/ai-ide-cli`), JSR publish, and version bump
   before integration — disproportionate effort for a single env var. Per
   AGENTS.md, the engine must be domain-agnostic and workflow-independent;
   Variant A achieves FR-E49 without touching the library contract.

2. **Unix process semantics guarantee coverage.** `Deno.env.set()` at engine
   startup propagates to all child processes (agent, continuation, HITL resume,
   loop body) through standard inheritance — no per-call-site wiring needed.
   All 4 spawn paths (agent.ts:210, agent.ts:322, hitl.ts:253, loop.ts:187)
   inherit automatically.

3. **Testable contract.** `buildEngineEnv()` is a pure function returning env
   overrides — directly unit-testable (AC4, AC5) without subprocess mocking.

4. **No process-level pollution risk.** `DISABLE_AUTOUPDATER` is inert for
   non-Claude subprocesses (git, gh, deno, validation scripts). The env var is
   Claude CLI-specific.

Variant C's forward-compatibility (accepting user env for merge) is speculative
— library `env` field semantics are undefined today. Adding it now creates
dead-code surface. If the library gains `env` support (FR-L), a simple
refactor of `buildEngineEnv()` suffices.

## Task Descriptions

### Task 1: Add `claude_cli_version` to `RunState`

Add `claude_cli_version?: string` field to the `RunState` interface in
`types.ts`. Optional field — absent for runs that predate FR-E49 (backward
compatible with existing `state.json` files).

### Task 2: Create `spawn-env.ts` module

New module exporting:
- `buildEngineEnv(): Record<string, string>` — returns
  `{ DISABLE_AUTOUPDATER: "1" }`. Engine-mandated vars always win.
- `captureCliVersion(cwd?: string): Promise<string>` — runs
  `claude --version` via `Deno.Command`, returns trimmed stdout. Throws on
  non-zero exit (fail-fast — version capture is non-optional).

### Task 3: Create `spawn-env_test.ts`

Unit tests:
- `buildEngineEnv` returns env with `DISABLE_AUTOUPDATER=1`.
- `buildEngineEnv` result always contains engine vars (always-wins).
- `captureCliVersion` returns version string (integration test, requires
  `claude` on PATH or skip).

### Task 4: Wire into engine startup

In `engine.ts`, at run start (after config load, before first node execution):
1. Call `buildEngineEnv()`, apply each key via `Deno.env.set()`.
2. Call `captureCliVersion(workDir)`, store result in
   `state.claude_cli_version`.
3. Save state (version persisted to `state.json`).

### Task 5: State roundtrip test

In `state_test.ts`: add test verifying `claude_cli_version` survives
save/load cycle in `state.json`.

### Task 6: Full check suite

Run `deno task check` (fmt + lint + type-check + tests + doc-lint + publish
dry-run) to verify AC6.

## Summary

Selected Variant A (process-level env injection). Rationale: minimal effort
(S-size), all ACs achievable within engine repo, no cross-repo dependency.
6 tasks ordered by dependency. Branch `sdlc/issue-196` with draft PR created.
