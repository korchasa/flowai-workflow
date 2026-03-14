---
variant: "Variant C: Delete git.ts, inline on_failure_script runner (smallest footprint)"
tasks:
  - desc: "Delete engine/git.ts and engine/git_test.ts"
    files: ["engine/git.ts", "engine/git_test.ts"]
  - desc: "Remove git re-exports from engine/mod.ts"
    files: ["engine/mod.ts"]
  - desc: "Add on_failure_script to PipelineDefaults and rename HitlConfig fields in engine/types.ts"
    files: ["engine/types.ts"]
  - desc: "Replace rollbackUncommitted() with inline runFailureHook() in engine/engine.ts"
    files: ["engine/engine.ts"]
  - desc: "Delete verboseCommit() from engine/output.ts and remove its tests"
    files: ["engine/output.ts", "engine/output_test.ts"]
  - desc: "Update hitl.ts and hitl_test.ts for renamed fields (artifact_source, exclude_login)"
    files: ["engine/hitl.ts", "engine/hitl_test.ts"]
  - desc: "Add on_failure_script execution tests in engine/engine_test.ts"
    files: ["engine/engine_test.ts"]
  - desc: "Create standalone rollback shell script and update pipeline.yaml"
    files: [".sdlc/scripts/rollback-uncommitted.sh", ".sdlc/pipeline.yaml"]
  - desc: "Update HITL script arg names in hitl-ask.sh and hitl-check.sh"
    files: [".sdlc/scripts/hitl-ask.sh", ".sdlc/scripts/hitl-check.sh"]
---

## Justification

**Variant C selected** over A (medium effort, same outcome) and B (over-engineered
module relocation with circular dependency risk).

- **Vision alignment (AGENTS.md):** "Engine is domain-agnostic: Engine is a generic
  DAG executor. It MUST NOT contain git, GitHub, branch, PR, or any other
  domain-specific logic." Variant C achieves this with minimal diff — delete
  `engine/git.ts` entirely, no relocation or bridge modules.
- **Simplicity:** ~10-line inline `runFailureHook()` in `engine.ts` replaces
  hard-wired `rollbackUncommitted()` with configurable `on_failure_script`. No new
  modules, no new import paths, no maintenance surface growth.
- **Risk profile:** Lowest. Grep confirms `CommitResult` type only used within
  `engine/` files (git.ts, git_test.ts, design.md). No external consumers of
  git exports from `mod.ts` — agents use `git` CLI directly per commit strategy.
- **Effort:** S (smallest of all variants).

## Task Descriptions

1. **Delete engine/git.ts and engine/git_test.ts** — Remove entire files. All
   functions (`rollbackUncommitted`, `commitNodeChanges`, `getCurrentBranch`,
   `pushToOrigin`, `branch`, `runGit`) are domain-specific. `CommitResult` type
   has no external consumers.

2. **Remove git re-exports from engine/mod.ts** — Delete the line
   `export { commitNodeChanges, getCurrentBranch, pushToOrigin } from "./git.ts"`.
   No consumers outside engine.

3. **Add on_failure_script + rename HitlConfig fields in engine/types.ts** —
   Add `on_failure_script?: string` to `PipelineDefaults`. Rename
   `HitlConfig.issue_source` → `artifact_source`, `HitlConfig.bot_login` →
   `exclude_login`. Remove `CommitResult` type if defined here.

4. **Replace rollbackUncommitted() in engine/engine.ts** — Remove
   `import { rollbackUncommitted } from "./git.ts"`. Add private
   `runFailureHook(script?: string)` method (~10 lines): if script provided,
   execute via `new Deno.Command(script)`, log stdout/stderr, swallow errors
   (failure hook must not crash engine). Replace `rollbackUncommitted()` call
   site with `this.runFailureHook(config.defaults.on_failure_script)`.

5. **Delete verboseCommit() from engine/output.ts** — Remove method and its
   references to `branchName`, `CommitResult`. Remove corresponding test cases
   from `engine/output_test.ts`.

6. **Update hitl.ts and hitl_test.ts** — Replace `issue_source` → `artifact_source`
   and `bot_login` → `exclude_login` in all references and test fixtures.

7. **Add on_failure_script tests in engine/engine_test.ts** — Test: script
   executes on pipeline failure; no-op when `on_failure_script` absent; script
   failure doesn't crash engine.

8. **Create rollback script + update pipeline.yaml** — New
   `.sdlc/scripts/rollback-uncommitted.sh`: `git checkout -- . && git reset HEAD`.
   Update `pipeline.yaml`: add `on_failure_script`, rename HITL fields.

9. **Update HITL script arg names** — `hitl-ask.sh`: `--issue-source` →
   `--artifact-source`. `hitl-check.sh`: `--bot-login` → `--exclude-login`.
