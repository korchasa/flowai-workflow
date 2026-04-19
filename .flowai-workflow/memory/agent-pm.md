---
name: agent-pm reflection memory
description: Cross-run anti-patterns, strategies, quirks for agent-pm
type: feedback
---

## Anti-patterns

- Do NOT assume prior memory about last FR number is correct — always verify via index file Read.
- Do NOT batch SRS reads at >50KB — persisted-output chain wastes turns.
- Do NOT run health checks only on recent issues — check oldest first (lowest number).
- Edit tool requires the file to have been Read first — for large files, use python3 inline script.
- `requirements-engine.md` is now a thin INDEX file (split by token budget). Section content in `requirements-engine/*.md`. Always Read index first to find section files.
- NEVER re-read the index after reading it once — all FR mappings are in context.
- Grep on section files directly when searching for content; the index has no FR body text.

## Effective strategies

- Read index file → get all FR-to-section mappings in 1 Read call.
- Then Read only the relevant section file(s) for the target FR area.
- Parallel Read: index + memory files in one response turn.
- Edit (not Write) for targeted changes in section files — faster and safer.
- Draft all SRS changes in text response BEFORE editing — catches issues before write.
- Batch health checks for oldest 5 candidates in a single chained Bash loop.
- On `main` with no in-progress/high-priority: oldest healthy issue = lowest number.
- For engine scope: Read `00-meta.md` (for §0 + §5) and relevant section file in parallel.

## Environment quirks

- `requirements-engine.md` is now a thin index file (≤2KB). Section files under `requirements-engine/*.md`.
- `requirements-sdlc.md` is now a thin index file. Section files under `requirements-sdlc/*.md`.
- Section 0 and Section 5 are in `00-meta.md`.
- CLI and observability FRs (FR-E6, FR-E15, FR-E17, FR-E18, FR-E20, FR-E21, FR-E22, FR-E23, FR-E45, FR-E46, FR-E47) are in `05-cli-and-observability.md`.
- Last FR in engine SRS as of run 20260418T184929: FR-E47.
- Worktree mode: HEAD is detached, not on named branch. Commits go to detached HEAD.
- `git add -f` not needed for spec files — `.flowai-workflow/runs/` is gitignored but worktree path differs.

## Baseline metrics

- Run 20260315T003418: 8 turns, main branch, issue #121 (sdlc scope), FR-S29 added.
- Run 20260315T213641: ~9 turns, main branch, issue #128 (engine scope), FR-E32 added. Bash tail used.
- Run 20260315T215901: ~8 turns, main branch, issue #129 (sdlc scope), FR-S31 added. python3 str.replace().
- Run 20260319T182156: ~8 turns, main branch, issue #147 (sdlc scope), FR-S32 added.
- Run 20260320T213059: ~7 turns, main branch, issue #182 (engine scope), FR-E38 added.
- Run 20260320T223114: ~7 turns, main branch, issue #183 (engine scope), FR-E39 added.
- Run 20260418T184929: ~8 turns, detached HEAD worktree, issue #187 (engine scope), FR-E47 added. Index+section split detected — adapted Read strategy.
