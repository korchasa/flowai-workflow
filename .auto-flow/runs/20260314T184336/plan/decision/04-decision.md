---
variant: "Variant A: SDLC-Only Move (Strict Scope Boundary)"
tasks:
  - desc: "Create .auto-flow/ directory structure and move pipeline.yaml"
    files: [".auto-flow/pipeline.yaml"]
  - desc: "Move agent prompts to .auto-flow/agents/<name>/SKILL.md, create symlinks from .claude/skills/agent-<name>/"
    files: [".auto-flow/agents/pm/SKILL.md", ".auto-flow/agents/architect/SKILL.md", ".auto-flow/agents/tech-lead/SKILL.md", ".auto-flow/agents/developer/SKILL.md", ".auto-flow/agents/qa/SKILL.md", ".auto-flow/agents/tech-lead-review/SKILL.md", ".auto-flow/agents/meta-agent/SKILL.md", ".claude/skills/agent-pm", ".claude/skills/agent-architect", ".claude/skills/agent-tech-lead", ".claude/skills/agent-developer", ".claude/skills/agent-qa", ".claude/skills/agent-tech-lead-review", ".claude/skills/agent-meta-agent"]
  - desc: "Move scripts from .sdlc/scripts/ to .auto-flow/scripts/"
    files: [".auto-flow/scripts/hitl-ask.sh", ".auto-flow/scripts/hitl-check.sh", ".auto-flow/scripts/rollback-uncommitted.sh", ".auto-flow/scripts/lib.sh", ".auto-flow/scripts/lib_test.ts"]
  - desc: "Move tasks from .sdlc/tasks/ to .auto-flow/tasks/"
    files: [".auto-flow/tasks/"]
  - desc: "Update pipeline.yaml internal paths (prompt, scripts, HITL)"
    files: [".auto-flow/pipeline.yaml"]
  - desc: "Delete deprecated legacy stage scripts (FR-S26)"
    files: [".sdlc/scripts/"]
  - desc: "Update scripts/check.ts paths (pipeline, skills dir, test dirs)"
    files: ["scripts/check.ts"]
  - desc: "Update deno.json task paths and exclusions"
    files: ["deno.json"]
  - desc: "Update .gitignore and .gitleaks.toml path references"
    files: [".gitignore", ".gitleaks.toml"]
  - desc: "Update CLAUDE.md, README.md, and doc references to new paths"
    files: ["CLAUDE.md", "README.md", "documents/design-sdlc.md"]
  - desc: "Update agent SKILL.md cross-references to new paths"
    files: [".auto-flow/agents/pm/SKILL.md", ".auto-flow/agents/architect/SKILL.md", ".auto-flow/agents/tech-lead/SKILL.md", ".auto-flow/agents/developer/SKILL.md", ".auto-flow/agents/qa/SKILL.md", ".auto-flow/agents/tech-lead-review/SKILL.md", ".auto-flow/agents/meta-agent/SKILL.md"]
---

## Justification

I selected Variant A because it respects the strict scope boundary mandated by
both the spec (`scope: sdlc`) and the project vision (AGENTS.md: "Engine is
domain-agnostic… MUST NOT depend on any specific pipeline config"). The spec
explicitly excludes engine code changes, and Variant B's own risk assessment
confirms that engine defaults are project-specific strings that "other projects
using the engine would have different defaults."

Variant A achieves the primary consolidation goal: all pipeline assets (config,
agent prompts, scripts, tasks) move to `.auto-flow/`, creating a single
portable directory. The tradeoff — runs remaining at `.sdlc/runs/` due to
engine's hardcoded `getRunDir()` — is acceptable because:

1. **Scope integrity:** Engine modifications belong in a separate `scope: engine`
   issue (Variant C's `runs_dir` config is the right long-term fix).
2. **Vision alignment:** AGENTS.md states "Engine is pipeline-independent." The
   engine should not encode `.auto-flow/` as a default — it should read the
   runs directory from config (future FR).
3. **Complexity:** Effort M vs L for Variants B/C. Fewer files modified, lower
   review burden, smaller blast radius.

Symlinks from `.claude/skills/agent-<name>/` to `../../.auto-flow/agents/<name>/`
preserve interactive `/agent-<name>` slash command discovery (FR-S13/FR-S17)
without duplicating prompt files.

## Task Descriptions

### Task 1: Create `.auto-flow/` directory structure and move `pipeline.yaml`

Create `.auto-flow/` root directory. Move `.sdlc/pipeline.yaml` to
`.auto-flow/pipeline.yaml`. This is the foundational move — all subsequent
tasks depend on the new directory existing.

### Task 2: Move agent prompts + create symlinks

Move all 7 agent SKILL.md files from `.claude/skills/agent-<name>/SKILL.md` to
`.auto-flow/agents/<name>/SKILL.md`. Replace original directories with symlinks
pointing to `../../.auto-flow/agents/<name>/` so Claude Code still discovers
them as `/agent-<name>` interactive skills.

### Task 3: Move scripts

Move `.sdlc/scripts/{hitl-ask.sh, hitl-check.sh, rollback-uncommitted.sh,
lib.sh, lib_test.ts}` to `.auto-flow/scripts/`. These are pipeline-specific
scripts invoked by engine via config paths.

### Task 4: Move tasks

Move `.sdlc/tasks/` directory contents to `.auto-flow/tasks/`. These are task
template files used by pipeline nodes.

### Task 5: Update `pipeline.yaml` internal paths

Update all path references inside `.auto-flow/pipeline.yaml`:
- `prompt:` fields → `.auto-flow/agents/<name>/SKILL.md`
- `on_failure_script:` → `.auto-flow/scripts/rollback-uncommitted.sh`
- `defaults.hitl.ask_script` → `.auto-flow/scripts/hitl-ask.sh`
- `defaults.hitl.check_script` → `.auto-flow/scripts/hitl-check.sh`
- Task template paths if present

### Task 6: Delete deprecated legacy stage scripts

Remove deprecated shell stage scripts (stage-1 through stage-9) per FR-S26
migration action. These are superseded by the engine and no longer referenced.

### Task 7: Update `scripts/check.ts`

Update `pipelinePath` to `.auto-flow/pipeline.yaml`, skills directory to
`.auto-flow/agents`, `testDirs` array entries from `.sdlc` to `.auto-flow`,
and comment scan exclusion pattern.

### Task 8: Update `deno.json`

Update `run` task to use `--config .auto-flow/pipeline.yaml`. Update legacy
`test:*` task paths from `.sdlc/scripts/` to `.auto-flow/scripts/`. Update
fmt/lint exclude patterns if needed.

### Task 9: Update `.gitignore` and `.gitleaks.toml`

Update `.gitignore` to exclude `.auto-flow/runs/` (note: engine still writes
to `.sdlc/runs/` — keep both patterns until engine issue resolves). Update
`.gitleaks.toml` allowlist paths from `.sdlc/` to `.auto-flow/`.

### Task 10: Update documentation references

Update `CLAUDE.md` (architecture section paths), `README.md` (any references
to `.sdlc/` or `.claude/skills/agent-*`), and `documents/design-sdlc.md`
(component paths throughout). Keep references to `.sdlc/runs/` where engine
still writes there.

### Task 11: Update agent SKILL.md cross-references

Update internal path references within agent prompt files. Meta-agent references
`.claude/skills/agent-*/SKILL.md` → `.auto-flow/agents/*/SKILL.md`. Other
agents may reference pipeline paths that need updating.

## Summary

I selected Variant A (SDLC-Only Move) for strict scope boundary compliance —
the spec declares `scope: sdlc` and AGENTS.md mandates engine independence. I
defined 11 ordered tasks covering directory creation, file moves with symlinks,
path updates across config/scripts/docs, and legacy cleanup. A follow-up engine
issue for configurable `runs_dir` will complete the consolidation. I created
branch `sdlc/issue-111` and opened a draft PR.
