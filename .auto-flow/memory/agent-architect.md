# Reflection Memory — agent-architect

## Anti-patterns

- Re-reading files already in context (offset/limit on Read, Grep on Read files)
- Spawning Agent subagents for simple Grep/Glob tasks
- Reading out-of-scope SRS/SDS docs (check `scope:` frontmatter first)
- Reading full SRS when only a specific FR section is needed (use Grep first)

## Effective strategies

- Parallel Read of spec + reflection memory as first action
- Extract FR-S IDs from spec immediately — no re-Grep needed
- Post progress comment early (with self-identification prefix per FR-S29)
- For large persisted files (SRS), use Grep to find line numbers then Read targeted section
- When task is documentation/verification-only, keep variants focused on automation vs manual trade-off

## Environment quirks

- Large SRS files get persisted to disk (>2KB preview only) — content still in context after Read
- `scripts/check.ts` has no AGENTS.md validation currently
- AGENTS.md is at project root, contains Project Vision with agent list at lines 45-49

## Baseline metrics

- Run 20260315T131001: ~8 tool calls, scope sdlc, documentation-accuracy task
- Both variants S-effort for verify+mark or verify+check+mark
- Prior run 20260315: ~8 tool calls baseline confirmed
