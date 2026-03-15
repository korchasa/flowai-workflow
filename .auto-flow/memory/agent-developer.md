# Reflection Memory — agent-developer

## Anti-patterns

- Writing complete files (Write) for simple section inserts when Edit would work
- Not checking deno fmt compliance for memory/*.md files — they require blank lines between headings and list items
- Memory files with trailing whitespace cause deno fmt failures even when no TS code changes

## Effective Strategies

- ONE Edit for single-location changes (e.g., agent-developer section insert)
- ONE Write for multi-location changes (insert + template update in same file)
- All 7 parallel Reads + git log in first 2 turns = minimal turns for SKILL.md-only tasks
- Pre-flight git log check prevents wasted work on pre-committed tasks

## Environment Quirks

- `deno fmt` checks ALL `.md` files in the repo, not just TypeScript
- Memory files require blank lines between `##` headings and first list item (deno fmt rule)
- SKILL.md-only tasks: no tests to write, deno task check passes if formatting is clean
- `.auto-flow/memory/*.md` files can accumulate trailing whitespace from prior agent writes
- deno task check output >50KB gets persisted to temp file — check `<error>` wrapper vs `<persisted-output>` to determine pass/fail (no error tag = PASS)

## Baseline Metrics

- Run 20260315T003418: ~14 turns, scope sdlc, issue #121 (FR-S29), 7 SKILL.md + 2 memory files
- 3 deno task check runs (1 initial fmt fail, 1 retry fmt fail, 1 PASS after blank line fix)
- Target: ≤35 turns. Achieved well under.
