# Migrate workflow assets to native Claude Code primitives

## Goal

Eliminate custom agent and memory conventions (`.flowai-workflow/agents/`,
`.flowai-workflow/memory/`) in favor of standard Claude Code primitives.
Workflow becomes a thin YAML wiring layer over native `.claude/agents/` and
`.claude/flowai-workflow-memory/`. Scripts stay in `.flowai-workflow/scripts/`.
Reduces cognitive overhead; agents reusable outside workflow context.

## Overview

### Context

Current SDLC workflow stores all assets under `.flowai-workflow/`:
- 6 agent SKILL.md files in `.flowai-workflow/agents/agent-*/SKILL.md`
- shared-rules.md + reflection-protocol.md
- 6 shell scripts in `.flowai-workflow/scripts/`
- 12 memory files in `.flowai-workflow/memory/`

These are custom conventions understood only by the engine. Claude Code has
native primitives: `.claude/agents/*.md` (subagents with YAML frontmatter),
`.claude/rules/*.md` (modular rules). Moving to these makes agents usable both
inside workflow AND interactively.

**ADR-001 (deleted):** ADR-001 (2026-03-17) rejected `--agent` in favor of
`--system-prompt-file`. This migration revisits that decision:
- `model` overridable via `--model` CLI flag (workflow.yaml already does this)
- `tools` frontmatter ignored under `--dangerously-skip-permissions`
- Each SDLC agent is unique — no agent reuse across phases with different params
- Native primitives bring interactive usability and ecosystem compatibility

**Experiment results (2026-04-04):**
- `--agent A -p "task"` → works, returns session_id
- `--resume <id> -p "continue"` → works, same session, context preserved
- `--agent` + `--dangerously-skip-permissions` → works
- System prompt composition (Claude Code v2.1.91):
  - `--system-prompt "X"` → SDK preamble + X (replaces base prompt sections)
  - `--agent A` → SDK preamble + agent body
  - `--agent A --system-prompt "X"` → SDK preamble + X (**agent body lost**)
  - `--agent A --append-system-prompt "X"` → SDK preamble + agent body + X (**both preserved**)
- Session files (`~/.claude/projects/`) do NOT store system prompt; Claude Code
  rebuilds it from files on each invocation/resume

### Current State

Engine (`engine/claude-process.ts:buildClaudeArgs()`) currently:
1. Passes `task_template` via `-p` (user message)
2. Supports `prompt`/`prompt_content` fields (→ `--system-prompt-file`/`--system-prompt`)
   but current SDLC workflow does NOT use them — all content inlined via `{{file()}}`
3. Inlines shared-rules.md + SKILL.md into `task_template` via `{{file(...)}}`

Workflow nodes reference custom paths:
```yaml
task_template: |
  {{file(".flowai-workflow/agents/shared-rules.md")}}
  ---
  {{file(".flowai-workflow/agents/agent-pm/SKILL.md")}}
```

Scripts referenced via `pre_run`, `on_failure_script`, `after`, HITL config.

Existing `scripts/` directory contains engine-level scripts (check.ts,
compile.ts, generate-dashboard.ts, etc.). Workflow (SDLC) scripts are in
`.flowai-workflow/scripts/`.

### Constraints

- Engine MUST remain domain-agnostic — no SDLC logic in engine code
- No backward compatibility needed
- Memory files → `.claude/flowai-workflow-memory/`
- Scripts stay in `.flowai-workflow/scripts/` (tightly coupled to workflow.yaml)
- Agent files → `.claude/agents/*.md` with YAML frontmatter
- shared-rules.md: universal rules → `.claude/rules/`, workflow-only rules →
  agent bodies (C1b decision)
- Workflow.yaml stays in `.flowai-workflow/`

## Definition of Done

- [ ] Engine: `agent` field in NodeConfig; passes `--agent <name>` to CLI
- [ ] Engine: `system_prompt` field in NodeConfig; passes `--append-system-prompt` to CLI
- [ ] Engine: `prompt` field repurposed as templateable `-p` prompt (replaces `task_template`)
- [ ] Engine: `task_template`, `prompt_content` fields removed
- [ ] Engine: `collectPromptPaths()`, `validatePromptPaths()`, `readPromptContent()` removed
- [ ] Engine: tests cover `--agent`, `--append-system-prompt`, `prompt` interpolation, validation
- [ ] SDLC: 6 agents migrated to `.claude/agents/*.md`
- [ ] SDLC: shared-rules split — universal → `.claude/rules/`, workflow-only → agent bodies
- [ ] SDLC: memory files moved to `.claude/flowai-workflow-memory/`
- [ ] SDLC: workflow.yaml updated to use `agent`/`prompt` fields
- [ ] SDLC: `.claude/settings.json` cleaned up (stale paths removed)
- [x] Docs: ADR-001 deleted (superseded; content preserved in SDS Future Work)
- [ ] All tests pass (`deno task check`)

## Solution

Selected: **Variant A — Engine-native `--agent` support** (with critique fixes)

### Phase 1: Engine changes (scope: engine)

**Step 1.1: Modify `NodeConfig` in `engine/types.ts`**
- Add `agent?: string` — name of Claude Code agent (without `.md`)
- Repurpose `prompt?: string` — templateable prompt text (→ `-p`), supports
  `{{...}}` interpolation. Replaces `task_template`
- Add `system_prompt?: string` — templateable extra system context
  (→ `--append-system-prompt`). Appended after agent body in system prompt.
  Supports `{{...}}`. Rare case: workflow-specific rules, dynamic context
- Remove `task_template?: string`
- Remove `prompt_content?: string`

Three fields for agent nodes:
- `agent` (optional) → `--agent <name>` — identity + base system prompt
- `system_prompt` (optional) → `--append-system-prompt` — extra system context
- `prompt` (required) → `-p` — task/user message

**Step 1.2: Modify `InvokeOptions` in `engine/claude-process.ts`**
- Add `agent?: string`
- Add `systemPrompt?: string`
- Remove `promptFile`, `promptContent`
- `buildClaudeArgs()` changes:
  ```
  // Before (lines 98-103):
  if (opts.promptContent) args.push("--system-prompt", opts.promptContent);
  else if (opts.promptFile) args.push("--system-prompt-file", opts.promptFile);

  // After:
  if (!opts.resumeSessionId) {
    if (opts.agent) args.push("--agent", opts.agent);
    if (opts.systemPrompt) args.push("--append-system-prompt", opts.systemPrompt);
  }
  ```
  - Both `--agent` and `--append-system-prompt` skipped on `--resume`
    (session rebuilds system prompt from files/config on resume)
  - `-p` (taskPrompt) unchanged
  - `--model` unchanged (overrides agent frontmatter)

**Step 1.3: Update config validation in `engine/config.ts`**
- Agent node validation: require `prompt` (every agent needs a `-p` message).
  `agent` is optional (allows prompt-only agent nodes for simple tasks)
- Remove `validatePromptPaths()` + `readPromptContent()` (no prompt file caching)
- Remove `collectPromptPaths()` (only used in `workflow_integrity_test.ts` —
  test removed too)
- Keep `validateFileReferences()` — update to scan `prompt` and `system_prompt`
  fields (was `task_template` and `prompt`)
- Rename internal references from `task_template` to `prompt` in validation

**Step 1.4: Update agent runner in `engine/agent.ts`**
- `runAgent()`: pass `agent: node.agent` and `systemPrompt: interpolated(node.system_prompt)`
  to `invokeClaudeCli()`
- Build task prompt from `node.prompt` (was `node.task_template`)
- Remove `promptFile`/`promptContent` resolution

**Step 1.5: Tests (TDD)**
- `buildClaudeArgs()` with `agent: "agent-pm"` → `["--agent", "agent-pm"]`
- `buildClaudeArgs()` with `systemPrompt: "X"` → `["--append-system-prompt", "X"]`
- `buildClaudeArgs()` with `agent` + `systemPrompt` → both flags present
- `buildClaudeArgs()` with `agent` + `resumeSessionId` → no `--agent`, no `--append-system-prompt`
- Config validation: `agent` without `prompt` → error
- Config validation: `prompt` without `agent` → valid (simple task node)
- Config validation: `system_prompt` without `agent` → valid (standalone system prompt)
- Config validation: `task_template` field → error (removed)
- Remove `workflow_integrity_test.ts` (tested `collectPromptPaths`)
- Remove dead `promptFile`/`promptContent` test cases

### Phase 2: Migrate SDLC agents (scope: sdlc)

**Step 2.1: Convert 6 SKILL.md → `.claude/agents/*.md`**

```
.flowai-workflow/agents/agent-pm/SKILL.md         → .claude/agents/agent-pm.md
.flowai-workflow/agents/agent-architect/SKILL.md   → .claude/agents/agent-architect.md
.flowai-workflow/agents/agent-tech-lead/SKILL.md   → .claude/agents/agent-tech-lead.md
.flowai-workflow/agents/agent-developer/SKILL.md   → .claude/agents/agent-developer.md
.flowai-workflow/agents/agent-qa/SKILL.md          → .claude/agents/agent-qa.md
.flowai-workflow/agents/agent-tech-lead-review/SKILL.md → .claude/agents/agent-tech-lead-review.md
```

Frontmatter:
- Keep: `name`, `description`
- Remove: `compatibility`
- Do NOT add: `model`, `tools`, `permissionMode` (workflow concerns)

Body changes per agent:
- Update memory paths: `.flowai-workflow/memory/` → `.claude/flowai-workflow-memory/`
- Update script paths if referenced
- Add workflow-only rules from shared-rules.md to each agent body (see 2.2)

**Step 2.2: Split shared-rules.md**

**Universal rules → `.claude/rules/`** (apply to all sessions):
- `read-efficiency.md` — ONE READ PER FILE, no offset/limit, zero Grep after Read, parallel reads
- `tool-call-efficiency.md` — parallel tool calls, context compression awareness
- `writing-style.md` — first-person voice, ONE WRITE per SRS/SDS
- `scope-aware-docs.md` — scope-aware SRS/SDS reads
- `bash-prefer-tools.md` — prefer Read/Grep/Glob/Edit/Write over Bash equivalents

**Workflow-only rules → inline in each agent body:**
- Tool restrictions (Skill/Agent/ToolSearch FORBIDDEN) — would break interactive
- `git add -f` for runs/ — workflow-specific
- File modification scope — per-agent list already in SKILL.md
- Reflection memory protocol — workflow-specific

### Phase 3: Migrate memory (scope: sdlc)

```
.flowai-workflow/memory/*.md → .claude/flowai-workflow-memory/*.md
```

12 files (6 memory + 6 history).

### Phase 4: Update workflow.yaml (scope: sdlc)

**Step 4.1: Update node definitions**

Before:
```yaml
specification:
  type: agent
  label: "Project Manager — Specification"
  task_template: |
    {{file(".flowai-workflow/agents/shared-rules.md")}}
    ---
    {{file(".flowai-workflow/agents/agent-pm/SKILL.md")}}
    ---
    Read reflection memory at .flowai-workflow/memory/agent-pm.md...
    Output: {{node_dir}}/01-spec.md
```

After:
```yaml
specification:
  type: agent
  label: "Project Manager — Specification"
  agent: agent-pm
  prompt: |
    Read reflection memory at .claude/flowai-workflow-memory/agent-pm.md
    and history at .claude/flowai-workflow-memory/agent-pm-history.md
    before starting. Update both when done.
    Triage open GitHub issues...
    Output: {{node_dir}}/01-spec.md
```

Apply to all 6 agent nodes (4 top-level + 2 loop body).
Script paths in `pre_run`, `on_failure_script`, `after`, HITL — unchanged
(scripts stay in `.flowai-workflow/scripts/`).

**Step 4.2: Update `.claude/settings.json`**

Remove stale entries:
- `/workspaces/flowai-workflow/` paths (old devcontainer)
- `auto-sdlc` references (old project name)
- Any `.flowai-workflow/scripts/` or `.flowai-workflow/agents/` refs

### Phase 5: Cleanup (scope: engine+sdlc)

**Step 5.1: Remove old directories**
- `.flowai-workflow/agents/` — all content migrated to `.claude/agents/`
- `.flowai-workflow/memory/` — all content migrated to `.claude/flowai-workflow-memory/`

**Step 5.2: ADR-001 — DONE (deleted)**
- ADR-001 deleted. Superseded content preserved in Design-Engine §7 (C5) and
  Design-SDLC §7 (C4) as "Future Work" notes.

**Step 5.3: Update documentation**
- `CLAUDE.md`: update architecture section paths
- `documents/design-sdlc.md`: update component paths
- `documents/requirements-sdlc.md`: add FR for native agent support

**Step 5.4: Final verification**
- `deno task check`
- Dry-run workflow: `deno task run --dry-run`

### Execution Order

```
Phase 1 (engine types + buildClaudeArgs + config + agent runner + tests)
  → Phase 2 (agents + shared-rules)
  → Phase 3 (memory)
  → Phase 4 (workflow.yaml + settings.json)
  → Phase 5 (cleanup + docs)
```

### Risk Mitigations

- **`--agent` + `--resume`**: experimentally confirmed (2026-04-04)
- **`--agent` + `--append-system-prompt`**: experimentally confirmed — both
  agent body and appended text present in system prompt
- **`.claude/rules/` in interactive**: only universal rules placed there;
  workflow-only rules (tool restrictions, file scope) stay in agent bodies
- **`--model` precedence**: workflow.yaml `model` → `--model` flag → overrides
  agent frontmatter. Same behavior as current `--system-prompt-file` path
- **`system_prompt` on resume**: skipped (same as `--agent`); Claude Code
  rebuilds system prompt from files on each invocation
- **Rollback**: single feature branch, git revert
