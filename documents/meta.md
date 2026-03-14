# Meta-Agent Memory

## Agent Baselines
- pm (specification): 12t/$0.62/105s — REGRESSED ($0.37→$0.62). 4× tool-results re-read (gh comments overflow). --jq fix applied in 080106 but PM still used `--json comments`.
- architect (design): 13t/$0.29/60s — stable.
- tech-lead (decision): 14t/$0.32/85s — IMPROVED ($0.53→$0.32). tl-design-md-reread + double-git-commit both clean.
- developer (build): 13t/$0.31/61s — stable. Chained git add -f working.
- qa (verify): 17t/$0.42/86s — IMPROVED ($0.75→$0.42). No SKILL.md reads. Still: 4 bash grep + double deno check.
- Total run cost: $1.96 (down from $2.25)
- 1 iteration (QA passed first try)

## Active Patterns
- pm-oversized-gh-output: WATCHING, first seen 080106, last seen 080440. 2nd
  consecutive. PM still uses `--json comments` despite `--jq` fix. Strengthened:
  pre-flight check "verify command has no `comments`" before Bash call.
- qa-bash-grep-v3: WATCHING, last seen 080440. 4th consecutive. 4 bash grep
  calls (grep -c ×3, grep -n ×1). Fix: pre-flight check + positive Grep tool
  alternative with exact syntax.
- qa-double-deno-check: WATCHING, last seen 080440. 2nd consecutive. Ran
  `deno task check` then re-ran with `| tail -20`. Updated evidence count.
- architect-grep-after-read-v2: NOT violated in 080440. 1st clean run.
- tl-design-md-reread: NOT violated in 080440. 1st clean run (text-extraction fix worked).
- dev-design-md-reread: NOT violated in 080440. 1st clean run.
- double-git-commit: NOT violated in 080440. 2nd clean run (chained fix worked).
- dev-bash-grep: NOT violated in 080440. 2nd clean run.
- qa-individual-file-reads-v2: RESOLVED (2 clean runs: 080106, 080440).

## Resolved Patterns
- developer-grep-after-read: RESOLVED (3+ clean runs)
- tech-lead-write-rewrite: RESOLVED (3 clean runs)
- tech-lead-git-stash: RESOLVED (3 clean runs)
- qa-tool-results-reread: RESOLVED (3 clean runs)
- qa-duplicate-pr-list: RESOLVED (3 clean runs)
- pm-grep-after-read: RESOLVED (3+ clean runs)
- developer-file-rereads: RESOLVED (3+ clean runs)
- pm-multi-edit-srs: RESOLVED (3+ clean runs)
- pm-tool-results-reread: RESOLVED (3 clean runs)
- pm-branch-shortcut-regression: RESOLVED (3 clean runs)
- qa-grep-after-read-v3: RESOLVED (3 clean runs)
- qa-deno-check-double: RESOLVED → MUTATED into qa-background-deno-check → qa-double-deno-check
- pm-edit-requirements-v2: RESOLVED (3+ clean runs)
- pm-skill-self-invocation: RESOLVED (3+ clean runs)
- qa-skill-self-invocation: RESOLVED (3+ clean runs)
- pm-branch-shortcut-v3: RESOLVED (3+ clean runs)
- recursive-skill-call: RESOLVED (3+ clean runs)
- tech-lead-merge-conflicts: RESOLVED (3+ clean runs)
- architect-git-archaeology: RESOLVED (3+ clean runs)
- architect-reread-offset: RESOLVED (3+ clean runs)
- dev-individual-file-reads: RESOLVED (3+ clean runs)
- architect-bulk-file-reads: RESOLVED (3+ clean runs)
- tl-push-force-with-lease: RESOLVED (2 clean runs)
- qa-bash-grep-v2: RESOLVED → MUTATED into qa-bash-grep-v3
- qa-individual-file-reads-v2: RESOLVED (2 clean runs: 080106, 080440)

## Applied Fixes Log
- 20260313T021326–20260314T062600: (compressed — see git history for details)
- 20260314T072450: pm/qa — anti-Skill before # Role heading. dev — Grep-first.
- 20260314T073009: qa — deno check algorithm + Bash grep prohibition.
  architect — HARD STOP for cross-file checks.
- 20260314T074913: qa — FOREGROUND mandatory, banned ToolSearch/TaskOutput.
  tech-lead — git push -f, forbidden git commands, read-once evidence.
- 20260314T074859: qa — HARD STOP SKILL.md reads. Stronger FOREGROUND mandate.
  tech-lead — text-extraction ALGORITHM. Chained `git add -f && commit`.
  developer — single-call Grep ALGORITHM. Chained `git add -f`.
  architect — updated Grep-after-Read evidence (6th consecutive).
- 20260314T080106: pm — `--jq '{title,body}'` to prevent oversized gh output
  (4 retries wasted $0.24). Tool-results retry limit to 1.
  qa — banned `sed`/`for` loops via Bash. "USE INSTEAD" positive guidance.
  Updated double deno check evidence ("ONCE means ONCE").
  tech-lead — strengthened ALGORITHM with explicit fact-extraction template.
  developer — updated grep-after-read evidence with this run's data.
  architect — updated evidence to 7th consecutive violation, added ALGORITHM
  for writing FR-* IDs in text response.
- 20260314T080440: pm — pre-flight check "verify no `comments` in command"
  (2nd consecutive violation despite --jq fix). qa — Grep tool positive
  alternative with exact syntax (4th consecutive bash grep). Updated deno
  check evidence (2nd consecutive double-run).

## Lessons Learned
- Total pipeline cost baseline for M-effort issue: ~$2.25 (down from ~$5.00).
- Run artifacts under .sdlc/runs/ are gitignored — agents must use `git add -f`.
- QA self-approval fails (same user can't approve own PR). Need fallback path.
- **Blacklist approach fails for Bash commands.** WHITELIST is correct.
- **Rule placement matters.** Before # Role heading = strongest position.
- **Cross-agent patterns:** Fix in one agent, apply to ALL.
- **Positive algorithms > prohibition.** Ban-only HARD STOP fails for entrenched
  behavior. Positive algorithm (WHAT to do) works.
- **Skill tool is the most persistent anti-pattern.** Fix: anti-Skill as FIRST
  content (before # Role heading). 3 clean runs confirm.
- **Cost trajectory:** $5.09→$2.31→$4.67→$5.73→$3.38→$3.16→$4.09→$3.16→$1.75→$2.25→$2.28→$1.96.
- **Git archaeology is wasteful.** Agents should plan from current checkout.
- **Scattered HARD STOPs cause rule fatigue.** Single execution algorithm better.
- **Text checkpoint technique:** Requiring agent to WRITE analysis in text
  response creates commitment device.
- **Grep-first for multi-file verification.** One Grep replaces N Reads.
- **--force-with-lease fails without tracking ref.** Use `git push -f`.
- **Background Bash is an anti-pattern for short commands.** deno task check
  takes ~30s — not worth background mode overhead.
- **Double git commit pattern:** `.sdlc/runs/` is gitignored. Agents must use
  `git add -f` on FIRST attempt, not try without -f then retry.
- **Incremental context search is wasteful.** Use sufficient `-A`/`-C` from
  the first call.
- **gh issue view with comments can exceed 25k tokens.** Always use `--jq` to
  filter fields. Exclude comments or limit to last N.
- **Anti-pattern mutation:** Fixing one symptom (background deno check) can
  produce a new variant (double deno check with pipe). Track mutations.
- **Pre-flight checks > prohibition.** When agents ignore "don't do X", adding
  a self-check step ("before calling Bash, verify X is absent") works better.
- **Positive alternatives with exact syntax.** Bash grep persists because agents
  don't know the Grep tool equivalent. Providing exact call syntax eliminates gap.
