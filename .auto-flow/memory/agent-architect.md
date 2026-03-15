# Reflection Memory — agent-architect

## Anti-patterns

- Re-reading files already in context (offset/limit on Read, Grep on Read files)
- Spawning Agent subagents for simple Grep/Glob tasks
- Reading out-of-scope SRS/SDS docs (check `scope:` frontmatter first)

## Effective strategies

- Parallel Read of spec + reflection memory as first action
- Single Grep with glob pattern for cross-file checks
- Extract FR IDs from requirements immediately after Read — no re-Grep
- Post progress comment early (with self-identification prefix per FR-S29)
- When implementation already exists, identify evidence-only variant first
- Read affected source files (not just test files) to understand return types/signatures
- For trivial fixes, all variants will be S-effort — differentiate by coverage depth

## Environment quirks

- Large SRS files get persisted to disk (>2KB preview only) — content still in context
- AGENTS.md content mirrors CLAUDE.md structure (same preamble)
- Uncommitted changes in git status can affect merge risk assessment
- `releaseLock()` returns `Promise<void>` — assertEquals to undefined is valid but weak

## Baseline metrics

- Run 20260315T152252: 7 tool calls, engine scope, test-fix task, 3 variants
- Run 20260315T144221: ~8 tool calls, sdlc scope, evidence-only task
- Prior run 20260315: ~8 tool calls, sdlc scope, simple prompt update task
