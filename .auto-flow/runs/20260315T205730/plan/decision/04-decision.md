---
variant: "Variant A: Shared Protocol File + Inline HISTORY Spec"
tasks:
  - desc: "Create shared reflection protocol file"
    files: [".auto-flow/agents/reflection-protocol.md"]
  - desc: "Remove optimize node from pipeline.yaml (node def, phases, DAG comment)"
    files: [".auto-flow/pipeline.yaml"]
  - desc: "Move dashboard after: hook from optimize to tech-lead-review in pipeline.yaml"
    files: [".auto-flow/pipeline.yaml"]
  - desc: "Delete agent-meta-agent SKILL.md, memory file, and Claude Code symlink"
    files: [".auto-flow/agents/agent-meta-agent/SKILL.md", ".auto-flow/memory/agent-meta-agent.md", ".claude/skills/agent-meta-agent"]
  - desc: "Update 6 agent SKILL.md files: replace Reflection Memory section with protocol reference + HISTORY format"
    files: [".auto-flow/agents/agent-pm/SKILL.md", ".auto-flow/agents/agent-architect/SKILL.md", ".auto-flow/agents/agent-tech-lead/SKILL.md", ".auto-flow/agents/agent-developer/SKILL.md", ".auto-flow/agents/agent-qa/SKILL.md", ".auto-flow/agents/agent-tech-lead-review/SKILL.md"]
  - desc: "Update pipeline.yaml task_template for each agent: add history file path reference"
    files: [".auto-flow/pipeline.yaml"]
  - desc: "Update scripts/check.ts: remove Meta-Agent from expected agent list, count 7 to 6"
    files: ["scripts/check.ts"]
  - desc: "Update AGENTS.md: remove Meta-Agent from agent list (7 to 6)"
    files: ["AGENTS.md"]
---

## Justification

I selected **Variant A** (Shared Protocol File + Inline HISTORY Spec) for these
reasons:

1. **Single source of truth:** Extracting the reflection protocol into
   `.auto-flow/agents/reflection-protocol.md` eliminates ~10-line boilerplate
   duplication across 6 SKILL.md files. Protocol updates become atomic — one
   file edit propagates to all agents. This directly satisfies the spec
   requirement to extract shared reflection protocol.

2. **Two reinforcement points:** Each agent receives protocol awareness from
   both SKILL.md (reference block) and `task_template` (file path hint). This
   mitigates silent degradation risk where an agent fails to read the protocol
   file — the SKILL.md reference acts as fallback instruction.

3. **Vision alignment:** AGENTS.md states "agents are stateless — all context
   from file artifacts and system prompts." A shared protocol file is a file
   artifact that agents read — consistent with the stateless model. No runtime
   state, no cross-agent coupling.

4. **Variant B rejected:** 6x protocol duplication creates drift risk. Any
   protocol change requires synchronized edits to 6 SKILL.md files — error-prone
   and violates DRY.

5. **Variant C rejected:** Weakest interactive-mode reinforcement. Users
   invoking `/agent-<name>` without pipeline task_template would only see
   "follow protocol file" with no inline context. Variant A's SKILL.md reference
   block provides adequate inline context for both pipeline and interactive use.

## Task Descriptions

### Task 1: Create shared reflection protocol file

Create `.auto-flow/agents/reflection-protocol.md` containing the complete
two-layer reflection protocol:
- **Layer 1 (MEMORY):** Edit-in-place operative knowledge at
  `.auto-flow/memory/<agent>.md`. <=50 lines, full-snapshot rewrite (not
  append). Categories: anti-patterns, effective strategies, environment quirks,
  baseline metrics.
- **Layer 2 (HISTORY):** Append-only run log at
  `.auto-flow/memory/<agent>-history.md`. One entry per run: timestamp, issue#,
  turns, cost, outcome, key learnings. <=20 most recent entries (FIFO trim).
- **Lifecycle:** Read MEMORY + HISTORY at session start. Execute task. Append
  HISTORY entry. Rewrite MEMORY with current-state snapshot at session end.
- **Size constraints:** MEMORY <=50 lines. HISTORY <=20 entries.

### Task 2: Remove optimize node from pipeline.yaml

Remove the `optimize` node definition from `pipeline.yaml`. Remove `optimize`
from the `report` phase list. Update the DAG comment to reflect 6-agent
pipeline. Keep `tech-lead-review` in `report` phase.

### Task 3: Move dashboard hook

Move `after:` hook (dashboard generation) from `optimize` node to
`tech-lead-review` node in `pipeline.yaml`. Dashboard should still run
post-pipeline — `tech-lead-review` is now the final node.

### Task 4: Delete meta-agent files

Delete `.auto-flow/agents/agent-meta-agent/SKILL.md` (and parent directory if
empty). Delete `.auto-flow/memory/agent-meta-agent.md`. Remove
`.claude/skills/agent-meta-agent` symlink.

### Task 5: Update 6 agent SKILL.md files

In each of the 6 remaining agent SKILL.md files, replace the
`## Reflection Memory` section (~10 lines) with a short reference block (~5
lines):
- "Follow `.auto-flow/agents/reflection-protocol.md`."
- Memory path: `.auto-flow/memory/<agent>.md`
- History path: `.auto-flow/memory/<agent>-history.md`
- Agent-specific HISTORY format hint (what to log for this agent's role).

### Task 6: Update pipeline.yaml task_templates

Update `task_template` for each of the 6 agent nodes to include both memory
and history file paths: "Read reflection memory at
`.auto-flow/memory/<agent>.md` and history at
`.auto-flow/memory/<agent>-history.md`. Update both when done."

### Task 7: Update scripts/check.ts

In `agentListAccuracy()`, remove `Meta-Agent` from the expected agent list.
Update expected count from 7 to 6. Verify no other references to meta-agent
in validation logic.

### Task 8: Update AGENTS.md

Remove "Meta-Agent" from the agent list in Project Vision section (line 47).
Update count from 7 to 6 agents. Keep the list accurate: PM, Architect, Tech
Lead, Developer, QA, Tech Lead Review.

## Summary

- I selected Variant A (Shared Protocol File + Inline HISTORY Spec) for its
  single source of truth, two reinforcement points, and alignment with the
  stateless agent model from AGENTS.md.
- I defined 8 dependency-ordered tasks covering protocol creation, meta-agent
  removal, SKILL.md updates, pipeline config changes, and downstream file
  updates.
- I created branch `sdlc/issue-127` and opened a draft PR.
