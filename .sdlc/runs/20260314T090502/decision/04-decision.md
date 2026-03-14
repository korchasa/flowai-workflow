---
variant: "Variant A: Unified Voice section before Rules"
tasks:
  - desc: "Add ## Voice section to agent-pm SKILL.md"
    files: [".claude/skills/agent-pm/SKILL.md"]
  - desc: "Add ## Voice section to agent-architect SKILL.md"
    files: [".claude/skills/agent-architect/SKILL.md"]
  - desc: "Add ## Voice section to agent-tech-lead SKILL.md"
    files: [".claude/skills/agent-tech-lead/SKILL.md"]
  - desc: "Add ## Voice section to agent-developer SKILL.md"
    files: [".claude/skills/agent-developer/SKILL.md"]
  - desc: "Add ## Voice section to agent-qa SKILL.md"
    files: [".claude/skills/agent-qa/SKILL.md"]
  - desc: "Add ## Voice section to agent-tech-lead-review SKILL.md"
    files: [".claude/skills/agent-tech-lead-review/SKILL.md"]
  - desc: "Add ## Voice section to agent-meta-agent SKILL.md"
    files: [".claude/skills/agent-meta-agent/SKILL.md"]
---

## Justification

I selected Variant A for these reasons:

1. **AC compliance.** The spec (FR-40) explicitly requires a `## Voice` section
   in each SKILL.md. Variant B lacks this section — disqualified. Variant A
   satisfies the AC directly.

2. **Minimal token cost.** Variant C adds 15-20 extra lines per agent (~105-140
   lines total) with diminishing returns. Variant A keeps the directive to ~8
   lines per file (shared 3-line core + 1 correct/incorrect example pair +
   scope exclusion). This aligns with the project vision of autonomous pipeline
   efficiency — every extra prompt token costs money across every run.

3. **Sufficient compliance signal.** One correct + one incorrect example per
   agent is enough for LLM behavioral steering. Research on few-shot prompting
   shows 1 example pair achieves most of the compliance benefit. Variant C's
   second example pair and GitHub interaction sentence add complexity without
   proportional gain.

4. **Maintenance simplicity.** Identical core directive across 7 files means
   voice rules can be updated via search-and-replace. Agent-specific examples
   are minimal (1 pair each), limiting drift surface. Aligns with AGENTS.md
   vision: "agents are stateless — all context from file artifacts and system
   prompts" — keeping prompts lean preserves this principle.

5. **Risk acceptance.** The maintenance burden noted for Variant A (identical
   blocks across 7 files) is acceptable given: (a) voice rules are unlikely to
   change frequently, (b) the Meta-Agent can detect and fix drift, (c) the
   alternative (Variant B's external reference) creates a worse failure mode
   (agent may not read requirements.md in all contexts).

## Task Descriptions

All 7 tasks are independent (no cross-dependencies). They can execute in any
order or in parallel. Each task:

1. Opens the target SKILL.md file.
2. Inserts a `## Voice` section immediately before `## Rules`.
3. The section contains:
   - 3-line shared directive: first-person ("I") mandate, prohibited patterns
     (passive voice, third-person narrative), scope exclusions (YAML frontmatter,
     code blocks, structured data, tables).
   - 1 correct example drawn from that agent's output type (spec prose, plan
     text, decision justification, commit message/PR comment, QA verdict,
     review verdict, changelog entry).
   - 1 incorrect example showing the same content in prohibited voice.
4. Runs `deno task check` to verify no formatting/linting issues.
