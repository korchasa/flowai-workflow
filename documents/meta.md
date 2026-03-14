# Meta-Agent Memory

## Agent Baselines
- pm (specification): 13t/$0.54/91s — stable (simple task, no SRS changes needed)
- architect (design): 15t/$0.43/76s — stable
- tech-lead (decision): 14t/$0.47/89s — stable
- developer (build): 14t/$0.50/50s — stable (simple 2-file rename)
- qa (verify): 21t/$0.67/105s — ISSUE: 7 re-reads of check output temp file
- Total run cost: $2.61 (lowest yet; simple task)
- 1 iteration (QA passed first try)

## Active Patterns
- pm-multi-edit-srs: RESOLVED, first seen 20260313T234144,
  last seen 20260314T000902. Fix (draft→Write, NEVER Edit) confirmed working:
  16t/2 Writes in 20260314T010515. 1 clean run.
- developer-multi-edit-waste: RESOLVED, first seen 20260313T230627,
  last seen 20260314T000902. Fix (replace_all + checklist) confirmed working:
  20t/$1.21 in 20260314T010515 (was 81t/$7.02). 1 clean run.
- developer-reread-waste: RESOLVED, first seen 20260314T000902.
  20t/11 Reads in 20260314T010515 (no wasted re-reads). 1 clean run.
- qa-reread-waste: REGRESSED, first seen 20260313T234144,
  last seen 20260314T013359. Recurred: 7 reads of same temp file (was marked
  RESOLVED after 3 clean runs). Fix v2 applied: explicit temp-file naming in
  QA prompt. WATCHING.
- pm-branch-shortcut-regression: RESOLVED (3 consecutive runs with shortcut
  working: 22→17t, no gh issue list on branch).
- tech-lead-bash-exploration: RESOLVED (all 8 Bash commands whitelisted,
  17t down from 25t). Whitelist approach confirmed effective.
- qa-bash-explosion: RESOLVED (6 Bash commands, all whitelisted).
  Whitelist approach confirmed effective.

## Applied Fixes Log
- 20260313T021326: pm — CRITICAL HARD CONSTRAINT on design.md → RESOLVED
- 20260313T023047: developer — efficiency guidance → RESOLVED
- 20260313T161422: tech-lead — simplified git workflow → RESOLVED (17t stable)
- 20260313T223344: tech-lead — FORBIDDEN stash/checkout/pull → RESOLVED
- 20260313T224909: qa — FORBIDDEN Agent+Bash → superseded by whitelist
- 20260313T230627: pm — reordered steps (shortcut=step1) → RESOLVED (17t)
- 20260313T230627: tech-lead — Bash WHITELIST → RESOLVED (all 8 cmds valid)
- 20260313T230627: developer — FORBIDDEN multi-edit + re-reads → FAILED (ignored)
- 20260313T230627: qa — Bash WHITELIST → RESOLVED (6 cmds, all valid)
- 20260313T234144: developer — ONE WRITE PER FILE mandatory → FAILED (81t, 22 writes)
- 20260313T234144: qa — ONE READ PER FILE mandatory → IMPROVED (24t from 27t)
- 20260313T234144: pm — ONE WRITE for SRS mandatory → FAILED (13 Edits, worse)
- 20260314T000902: pm — step-by-step enforcement: draft→Write, NEVER Edit → RESOLVED
  (16t/2 Writes in 20260314T010515)
- 20260314T000902: developer — replace_all for renames, mandatory checklist → RESOLVED
  (20t/$1.21 in 20260314T010515, down from 81t/$7.02)
- 20260314T010515: no fixes needed — all agents within acceptable ranges
- 20260314T013359: qa — strengthened temp-file re-read rule with explicit path
  pattern and dual-run evidence. WATCHING for next run.

## Lessons Learned
- PM/SDS-update scope overlap resolved by explicit constraints in PM prompt.
- Engine loop bug (buildContext node lookup) fixed in commit f9c9983.
- Total pipeline cost baseline for M-effort issue: ~$6.00.
- Pipeline config gap: build node has no input from verify for iter > 1.
- Run artifacts under .sdlc/runs/ are gitignored — agents must use `git add -f`.
- QA self-approval fails (same user can't approve own PR). Need fallback path.
- TodoWrite in developer is pure overhead. Banned — confirmed 0 calls (3 runs).
- **Blacklist approach fails for Bash commands.** WHITELIST is correct — now
  confirmed effective for tech-lead (3 runs) and QA (2 runs).
- **Step ordering matters.** Put fast-path shortcuts FIRST. Confirmed effective.
- **"FORBIDDEN" keyword is insufficient for multi-edit waste.** Agents ignore
  "FORBIDDEN multiple edits" because each individual Edit feels justified.
  Reframed as "ONE WRITE PER FILE (MANDATORY)" — positive instruction > ban.
- **Re-read waste is a distinct pattern from multi-edit waste.** QA re-reads
  tool output files (not source files) — need explicit rule covering ALL file
  types including tool-result temp files.
- **"ONE WRITE/READ" rules alone are insufficient.** Developer ignored them at
  81 turns. Root cause: agent doesn't plan ahead — edits file, runs check,
  re-reads to fix, re-writes. Fix: mandatory pre-edit checklist + replace_all
  for rename tasks.
- **PM ignores "ONE WRITE" when task has many SRS sections to update.**
  Root cause: Edit feels easier per-section. Fix: make Edit on SRS explicitly
  forbidden + enforce step-by-step (draft in text → one Write).
- **QA temp-file re-read is a persistent pattern.** Generic "ONE READ PER FILE"
  rule is insufficient — agent doesn't recognize tool-result temp files as
  "files" covered by the rule. Must explicitly name the path pattern and
  reference concrete past failures.
