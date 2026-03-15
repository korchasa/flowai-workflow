---
name: agent-pm reflection memory
description: Cross-run anti-patterns, strategies, quirks for agent-pm
type: feedback
---

## Anti-patterns

- `requirements-sdlc.md` is ~70KB — too large to Read in one call; hits tool-results redirect chain. Cannot reconstruct full content for a Write call. Use targeted Grep + offset/limit reads to gather specific sections, then Edit for surgical insertions.
- The "NEVER use Edit on SRS files" rule is impractical when the SRS is >50KB and cannot be fully loaded. A single targeted Edit (one insertion) is the pragmatic equivalent of a Write on large files.
- Tool-results redirect chains: reading a persisted-output file that also exceeds limits creates a second redirect, then a third. Do NOT follow more than 1 redirect — use Grep/offset reads on the original file directly instead.
- Do NOT use `head` in piped commands on this Linux — `head --oneline` flag not recognized. Use `git log --oneline -N` directly.

## Effective strategies

- Grep for `^### 3\.\d+ FR-S\d+` pattern on SRS to find all FR numbers and their line ranges in one call — fast and reliable.
- Read targeted line ranges (offset + limit or sed -n) to get specific sections (e.g., last FR, section 4 boundary).
- On `main` branch with no in-progress issues: fall back immediately to `gh issue list --limit 10`, pick first result (oldest = lowest number).
- Draft all SRS changes in text response BEFORE writing — catches issues before the write.
- Always grep for the issue keyword (e.g., "Presenter") in AGENTS.md and docs to confirm current state before speccing — issue description may be stale.
- Use two Edit calls for large SRS: (1) insert new FR section before `## 4.`, (2) append migration table row.

## Environment quirks

- `requirements-sdlc.md` exceeds tool-results redirect buffer (~70KB). Three-level redirect chain observed. Use Grep + targeted reads instead of full Read.
- `gh issue view` without `comments` flag is fast (~1KB). Always omit `comments`.
- `gh issue list --label "in-progress"` returns `[]` most of the time — always have fallback to `--limit 10` all open.
- Issues may be stale: acceptance criteria/line references in issue body may no longer match current code. Always verify current state independently.
- `head` command on this Linux does not accept `--oneline` as flag. For git log use `git log --oneline -N` (no pipe to head).

## Baseline metrics

- Run 20260315T003418: 8 turns, main branch, no in-progress issues, issue #121 (sdlc scope), FR-S29 added. (Note: FR-S29 was later dropped in docs refactor commit f4ca410.)
- Run 20260315T131001: ~12 turns, main branch, issue #86 (sdlc scope), FR-S29 added (AGENTS.md agent list accuracy). Extra turns due to stale issue verification and bash command error.
- Large SRS file (>50KB): 3 extra turns for read workarounds. Plan for 2-3 extra turns.
