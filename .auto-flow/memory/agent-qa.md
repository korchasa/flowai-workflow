---
name: agent-qa
description: Reflection memory for QA agent — anti-patterns, strategies, environment quirks
type: feedback
---

## Anti-Patterns

- `deno task check` output is often too large for inline display — saved to temp file. Reading that temp file also produces a nested temp file. Use `tail -80 <first-temp-file>` to get the final summary instead of re-reading recursively.
- Memory/history files start empty on first session — normal, no content to read.
- Self-approval via `gh pr review --approve` fails when QA runs as the PR author. Fall back to `gh issue comment` immediately, do not retry.
- When developer uses a Write (full rewrite) for a large SRS file, PM-stage additions (like FR-S32) can be silently dropped. Check for new sections promised in spec's "SRS Changes" section even if `deno task check` passes.

## Effective Strategies

- Read spec + decision in parallel as first action (already done before running checks).
- Run `deno task check` and `git diff main...HEAD --name-only` and `gh issue view` all in one parallel turn.
- Read all key changed source files in one parallel response after getting the diff.
- `tail -80 <temp-file>` gets the final summary/pass-fail lines without recursive nesting.
- Grep for old artifact names across agents/ and documents/ to verify rename sweep completeness.
- Cross-check spec's "SRS Changes" section against actual SRS content — new FR sections (like FR-S32) can be lost if developer rewrote the file.

## Environment Quirks

- Large `deno task check` output → stored in temp file → reading temp file → stored in another temp file (recursive nesting). Use `tail` on the first temp file to get final lines.
- PR self-approval always fails in this repo (author = reviewer). Always use `gh issue comment` fallback.
- `documents/requirements-sdlc.md` is 74.9KB — too large to display inline; saved to temp file. Use `tail` + targeted Grep instead of full Read.

## Baseline Metrics

- Target: ≤15 turns
- First session (issue #129): ~10 turns, PASS verdict
- Second session (issue #146): ~8 turns, PASS verdict
- Third session (issue #147): ~11 turns, FAIL verdict (FR-S32 missing from SRS)
