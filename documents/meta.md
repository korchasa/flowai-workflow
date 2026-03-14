# Meta-Agent Memory

## Agent Baselines
- pm (specification): 31t/$1.51/212s — REGRESSED from 17t (13 Edits on SRS)
- architect (design): 8t/$0.51/735s (stable)
- tech-lead (decision): 26t/$0.72/121s — slight increase from 17t
- developer (build): 81t/$7.02/1798s — REGRESSED from 53t (re-read/re-write waste)
- qa (verify): 24t/$0.77/123s — improved from 27t/$0.89
- Total run cost: $10.53 (regressed from ~$6.00)
- 1 iteration (QA passed first try)

## Active Patterns
- pm-multi-edit-srs: ESCALATED, first seen 20260313T234144,
  last seen 20260314T000902. 13 Edits on requirements.md (was 3). "ONE WRITE"
  rule ignored entirely. Fix: step-by-step enforcement + "NEVER use Edit".
- developer-multi-edit-waste: ESCALATED, first seen 20260313T230627,
  last seen 20260314T000902. pipeline.yaml written 3x, 5 test files 2x.
  81t/$7.02 (was 53t/$3.01). Fix: added replace_all guidance + mandatory
  pre-edit checklist.
- developer-reread-waste: NEW, first seen 20260314T000902. 5 test files read
  3x each, stage-7-qa.sh 3x = 12 wasted reads despite ONE READ rule.
- qa-reread-waste: WATCHING, first seen 20260313T234144. 24t/$0.77 (improved
  from 27t/$0.89). Rule appears to be working — continue monitoring.
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
- 20260314T000902: pm — step-by-step enforcement: draft→Write, NEVER Edit → WATCHING
- 20260314T000902: developer — replace_all for renames, mandatory checklist,
  evidence from this run (81t/$7.02, 14 wasted writes, 12 wasted reads) → WATCHING

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
