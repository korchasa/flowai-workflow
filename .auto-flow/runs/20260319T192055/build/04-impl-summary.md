## Summary

- **Files changed:**
  - `.claude/skills/agent-pm` — deleted symlink (pointed to `../../.auto-flow/agents/agent-pm`)
  - `.claude/skills/agent-architect` — deleted symlink
  - `.claude/skills/agent-developer` — deleted symlink
  - `.claude/skills/agent-qa` — deleted symlink
  - `.claude/skills/agent-tech-lead` — deleted symlink
  - `.claude/skills/agent-tech-lead-review` — deleted symlink
  - `scripts/check.ts` — removed lines 103-130: symlink validation block in
    `pipelineIntegrity()` (the `// 2. Check agent symlinks...` loop and
    "Agent symlinks valid." log). Function now contains only `loadConfig()`
    delegation (step 1). `documents/design-sdlc.md` already updated by
    Tech Lead (FR-S33 migration note §3.4 was correct).
- **Tests added/modified:** None — no logic added; existing 493 tests serve as
  regression gate. Symlink validation had no dedicated tests.
- **`deno task check` result:** PASS (493 tests, all checks passed)
