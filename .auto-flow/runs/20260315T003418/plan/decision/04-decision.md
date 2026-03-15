---
variant: "Variant B: Centralized prefix rule + per-agent mapping table"
tasks:
  - desc: "Add ## Comment Identification section + update gh issue comment template in agent-pm/SKILL.md"
    files: [".auto-flow/agents/agent-pm/SKILL.md"]
  - desc: "Add ## Comment Identification section + update gh issue comment template in agent-architect/SKILL.md"
    files: [".auto-flow/agents/agent-architect/SKILL.md"]
  - desc: "Add ## Comment Identification section + update gh issue comment template in agent-tech-lead/SKILL.md"
    files: [".auto-flow/agents/agent-tech-lead/SKILL.md"]
  - desc: "Add ## Comment Identification section (no templates to update) in agent-developer/SKILL.md"
    files: [".auto-flow/agents/agent-developer/SKILL.md"]
  - desc: "Add ## Comment Identification section + update gh pr review and fallback comment templates in agent-qa/SKILL.md"
    files: [".auto-flow/agents/agent-qa/SKILL.md"]
  - desc: "Add ## Comment Identification section + update gh pr review template in agent-tech-lead-review/SKILL.md"
    files: [".auto-flow/agents/agent-tech-lead-review/SKILL.md"]
  - desc: "Add ## Comment Identification section + update gh issue comment template in agent-meta-agent/SKILL.md"
    files: [".auto-flow/agents/agent-meta-agent/SKILL.md"]
---

## Justification

I selected Variant B over Variants A and C for three reasons:

1. **Discoverability for dynamic comments.** AGENTS.md establishes that agents
   are stateless — all context comes from system prompts. A dedicated
   `## Comment Identification` section gives agents an explicit, findable rule
   they can apply to any `gh issue comment` or `gh pr review` call, including
   dynamically generated bodies not covered by hardcoded templates. Variant A
   (inline-only) relies on instructional text for the Developer agent and misses
   dynamic comments in other agents. Variant C overloads Voice (FR-S22/FR-43)
   with attribution semantics that are conceptually distinct.

2. **Separation of concerns.** FR-S22/FR-43 governs voice/tone (first-person
   narrative). FR-S29 governs attribution/identification (agent + phase prefix).
   A dedicated section keeps these orthogonal. Variant C conflates them in
   `## Voice`, which is already 3 example pairs long per agent.

3. **Minimal cost.** ~3-4 lines per SKILL.md (rule statement + agent-specific
   prefix value). Same 7 files as all variants. Effort remains S.

## Task Descriptions

**Task 1 — agent-pm/SKILL.md:** Add `## Comment Identification` section after
`## Voice` (or before `## Rules`). Content: rule statement ("All `gh issue
comment` and `gh pr review` body strings MUST start with
`**[<Agent> · <phase>]**`") + this agent's prefix: `**[PM · specify]**`.
Update the `gh issue comment` template on line ~130 to prepend the prefix.

**Task 2 — agent-architect/SKILL.md:** Same pattern. Prefix:
`**[Architect · plan]**`. Update template on line ~89.

**Task 3 — agent-tech-lead/SKILL.md:** Same pattern. Prefix:
`**[Tech Lead · decide]**`. Update template on line ~77.

**Task 4 — agent-developer/SKILL.md:** Add `## Comment Identification` section
only. Prefix: `**[Developer · implement]**`. No existing templates — section
serves as the rule for any future `gh issue comment` calls.

**Task 5 — agent-qa/SKILL.md:** Same pattern. Prefix: `**[QA · verify]**`.
Update 2 `gh pr review` templates (lines ~119-120) and fallback `gh issue
comment` instruction (line ~123).

**Task 6 — agent-tech-lead-review/SKILL.md:** Same pattern. Prefix:
`**[Tech Lead Review · review]**`. Update `gh pr review` template on line ~48.

**Task 7 — agent-meta-agent/SKILL.md:** Same pattern. Prefix:
`**[Meta-Agent · optimize]**`. Update `gh issue comment` template on line ~123.

## Summary

I selected Variant B (dedicated `## Comment Identification` section + template
updates) for its discoverability, clean separation from Voice (FR-S22), and
alignment with the stateless-agent-with-explicit-prompts vision from AGENTS.md.
I defined 7 atomic tasks — one per SKILL.md file — ordered independently (no
cross-file dependencies). Each task adds ~3-4 lines of section content and
updates existing hardcoded templates with the agent-specific prefix.
I created branch `sdlc/issue-121` and opened a draft PR.
