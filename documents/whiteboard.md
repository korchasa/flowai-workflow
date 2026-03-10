# Deferred Commit Strategy

## Goal

Eliminate per-node git commits during pipeline execution. Reduce overhead,
fix chicken-and-egg config mutation bug, simplify git history.

## Overview

### Context

Pipeline engine commits after every successful node (`commitIfNeeded()` in
`engine.ts:251`). This causes:

1. **Performance overhead:** ~15s per node × 8 nodes = ~2 min wasted on
   `git add -A` + `git commit` + safety check per commit.
2. **Chicken-and-egg bug:** Executor modifies `pipeline.yaml` on disk, but
   engine has config loaded in memory. QA/meta-agent use stale in-memory
   config referencing deleted paths (FR-19 run: QA failed with
   `file not found: .sdlc/agents/qa.md`).
3. **Noisy git history:** FR-19 run produced 10 commits instead of 1-2
   meaningful ones. Executor alone made 7 micro-commits.
4. **No practical value:** Inter-agent communication is filesystem-based
   (`{{input.<node>}}` templates read files from disk). `--resume` skip
   logic uses `state.json`, not git history.

### Current State

**Commit flow** (`engine.ts:527-551`, `git.ts:27-67`):
- `commitNodeChanges()` runs after every successful node
- `git add -A` → `git diff --cached --name-only` → `git commit -m "sdlc(...)"`
- Includes ALL changes (artifacts + project files + logs)

**Safety check flow** (`engine.ts:307-396`, `git.ts:74-133`):
- `safetyCheckDiff()` runs before commit for nodes with `allowed_paths`
- Uses `git diff --name-only HEAD` — compares against last commit
- If engine stops committing, HEAD stays at branch point → all accumulated
  changes visible in diff → scope check breaks for later nodes

**Resume flow** (`engine.ts:153-155`):
- `isNodeCompleted(state)` — pure state.json check
- Does NOT depend on git commits

**Executor behavior:**
- Claude Code agent commits independently (7 commits in FR-19 run)
- Engine then tries `commitNodeChanges()` on top — usually no-op or duplicate
- Engine cannot control agent's commit granularity

### Constraints

- Gitleaks secret detection must run (via `deno task check`)
- `--resume` must still skip completed nodes
- Presenter needs `git diff main...HEAD` for PR description
- Meta-agent needs to see what changed
- Executor must NOT commit — only explicit commit nodes do
- Must not break `deno task check`

## Definition of Done

- [x] Committer agent created (`agents/committer/SKILL.md`)
- [x] Commit nodes in pipeline = `type: agent` using committer prompt
- [x] Engine does NOT auto-commit after any node
- [x] Executor agent prompt: "DO NOT commit" (remove "commit per task" rule)
- [x] `safetyCheckDiff()` + `allowed_paths` fully removed (engine, git, types, config, YAML)
- [x] Gitleaks added to `scripts/check.ts` (replaces engine-level secret check)
- [x] `runGitleaks()` removed from `git.ts` (moved to check.ts)
- [x] `--resume` still works (state.json based — no change expected)
- [x] Chicken-and-egg bug eliminated (config not committed mid-run)
- [x] `deno task check` passes
- [x] FR-8 updated: scope check removed, gitleaks in `check`, future safety req
- [x] FR-14 updated: commits at explicit committer agent nodes

## Solution (Variant D+: Committer Agent + Safety Cleanup)

### Step 1: Create committer agent

**`agents/committer/SKILL.md`:**
```markdown
# Role: Committer
Stage all changes and commit with a concise, meaningful message.
## Rules
- Run `git add -A`
- If no staged changes: output "Nothing to commit" and exit
- Write commit message: `sdlc(<phase>): <summary of changes>`
- `<phase>` = value of SDLC_PHASE env var (e.g., "plan", "impl", "present")
- `<summary>` = brief description based on `git diff --cached --stat`
- Run `git commit -m "<message>"`
- Output the commit hash
```

### Step 2: Remove auto-commit from engine

**`engine.ts`:**
- Delete `await this.commitIfNeeded(nodeId, node)` (line 251)
- Delete `commitIfNeeded()` method (lines 527-551)

### Step 3: Remove safety check entirely

**`engine.ts`:**
- Remove safety check continuation loop (lines 307-396)
- Remove all `allowed_paths` / `safetyCheckDiff` references

**`git.ts`:**
- Delete `safetyCheckDiff()` (lines 74-133)
- Delete `SafetyCheckResult` interface (lines 19-24)
- Delete `runGitleaks()` + `GitleaksResult` (lines 169-217)
- Keep: `commitNodeChanges()`, `getCurrentBranch()`, `branch()`, `pushToOrigin()`

**`types.ts`:**
- Remove `allowed_paths?: string[]` from `NodeConfig`

**`config.ts`:**
- Remove `allowed_paths` validation if any

**Pipeline YAML:**
- Remove `allowed_paths` from all nodes

### Step 4: Add gitleaks to `scripts/check.ts`

**`scripts/check.ts`:**
- Add gitleaks step after lint, before tests:
  `await run("gitleaks", ["detect", "--no-git"], "Secret Scan", true)`
- `allowFailure=true` — skip if gitleaks binary not found (CI may not have it)

### Step 5: Update executor prompt

**`agents/executor/SKILL.md`:**
- Remove: "Commit per task: Each task from 04-decision.md gets its own commit"
- Remove: "Commit incrementally" from responsibilities
- Add rule: "DO NOT make git commits. All commits are managed by the pipeline."

### Step 6: Update pipeline YAML

**`pipeline.yaml` + `pipeline-task.yaml`:** add 3 committer agent nodes:

```yaml
  commit-plan:
    type: agent
    label: "Commit planning artifacts"
    prompt: agents/committer/SKILL.md
    inputs: [sds-update]
    env:
      SDLC_PHASE: plan
  impl-loop:
    inputs: [commit-plan]    # was: [sds-update]
  commit-impl:
    type: agent
    label: "Commit implementation"
    prompt: agents/committer/SKILL.md
    inputs: [impl-loop]
    env:
      SDLC_PHASE: impl
  presenter:
    inputs: [commit-impl]    # was: [impl-loop]
  commit-present:
    type: agent
    label: "Commit presentation artifacts"
    prompt: agents/committer/SKILL.md
    inputs: [presenter]
    env:
      SDLC_PHASE: present
  meta-agent:
    run_always: true         # unchanged
```

### Step 7: Tests (TDD)

**RED:**
- DAG: topological sort with new commit nodes in graph
- Safety: no tests (removed)

**GREEN:** implement steps 2-6

**REMOVE:**
- Tests asserting commit after agent node
- Tests for `safetyCheckDiff()` scope logic
- Tests for `commitIfNeeded()`

### Step 8: SRS update

- FR-14: "Commits via dedicated committer agent nodes, not per-stage"
- FR-8: remove scope check, note gitleaks in `deno task check`, add future req
  `[ ]` "simplified safety checks via git diff + file hash"
- Section 5: update commit strategy description

### Execution order

1. agents/committer/SKILL.md (new agent prompt)
2. Tests RED
3. engine.ts (remove auto-commit + safety loop)
4. git.ts (delete safety/gitleaks functions)
5. types.ts (remove `allowed_paths`)
6. config.ts (remove `allowed_paths` validation)
7. scripts/check.ts (add gitleaks step)
8. Tests GREEN
9. agents/executor/SKILL.md (no-commit rule)
10. pipeline.yaml + pipeline-task.yaml (committer nodes, remove allowed_paths)
11. `deno task check`
12. SRS (FR-8, FR-14)
