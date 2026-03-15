---
variant: "Variant A: Minimal SKILL.md patch (single-file change)"
tasks:
  - desc: "Add --author korchasa to gh issue list command in PM SKILL.md STEP 2a"
    files: [".auto-flow/agents/agent-pm/SKILL.md"]
  - desc: "Add author verification guard in PM SKILL.md STEP 2c (gh issue view --json author, fail fast if ≠ korchasa)"
    files: [".auto-flow/agents/agent-pm/SKILL.md"]
  - desc: "Run deno task check to verify pipeline integrity post-edit"
    files: []
---

## Justification

I selected Variant A for three reasons:

1. **Minimal blast radius:** Single file change (`.auto-flow/agents/agent-pm/SKILL.md`) satisfies all FR-S31 acceptance criteria. No code changes, no test changes, no check script modifications.

2. **Vision alignment (AGENTS.md):** Agents are stateless — all context comes from file artifacts and system prompts. The author filter belongs in the PM prompt (the agent responsible for issue triage), not in validation scripts or utility pre-flight checks. This keeps the filter at the decision boundary where it has the most impact.

3. **Complexity trade-off:** Variant B couples `check.ts` to prompt text via brittle string matching — Meta-Agent prompt rewording would cause false failures. Variant C changes pre-flight semantics of `self_runner.ts` and `loop_in_claude.ts` (hiding non-korchasa issues from count), which is outside FR-S31 scope boundaries.

Variants B and C were rejected: B over-engineers a single hardcoded value (configurability explicitly out of scope); C modifies utility script behavior beyond spec boundaries.

## Task Descriptions

### Task 1: Add `--author korchasa` to `gh issue list` in STEP 2a

I modify the PM SKILL.md `gh issue list` command template in STEP 2a (GET CANDIDATES) from:
```
gh issue list --state open --json number,title,labels --limit 20
```
to:
```
gh issue list --state open --author korchasa --json number,title,labels --limit 20
```

This filters the candidate list at triage time, preventing non-korchasa issues from entering the pipeline.

### Task 2: Add author verification guard in STEP 2c

I insert a new sub-step in STEP 2c (SELECT & SCOPE CHECK), before scope detection. After `gh issue view <N> --json body,title`, add:
```
gh issue view <N> --json author --jq '.author.login'
```
Fail fast if result ≠ `korchasa`. This handles the edge case where PM is resumed on an existing `sdlc/issue-<N>` branch and skips triage (direct processing path). The guard ensures author filtering even when the candidate list step is bypassed.

### Task 3: Run `deno task check`

I verify pipeline integrity after the SKILL.md edit. No files modified — validation-only step confirming the prompt change does not break `deno task check`.

## Summary

I selected Variant A (Minimal SKILL.md patch) for its minimal blast radius and alignment with the stateless-agent architecture. I defined 3 ordered tasks: add `--author korchasa` to `gh issue list` (Task 1), add author verification guard for resume path (Task 2), and validate with `deno task check` (Task 3). I will create branch `sdlc/issue-123` and open a draft PR.
