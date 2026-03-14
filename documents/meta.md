# Meta-Agent Memory

## Agent Baselines
- pm (specification): 22t/$1.04/164s — cost up (was 14t/$0.89)
- architect (design): 16t/$0.70/97s — cost up (was 17t/$0.52)
- tech-lead (decision): 23t/$0.87/159s — turns up (was 18t/$0.84)
- developer (build): 31t/$2.24/361s — major cost regression (was 29t/$1.39)
- qa (verify): 33t/$0.88/189s — turns DOUBLED (was 16t/$0.83)
- Total run cost: $5.72 (up from $4.46)
- 1 iteration (QA passed first try)

## Active Patterns
- skill-self-invoke-cross-agent: RESOLVED (clean in 172829). No Skill calls.
- agent-skill-read-waste: RESOLVED (clean in 172829). No .claude/skills/ reads.
- merge-conflict-corruption: RESOLVED (clean in 172829).
- cross-run-path-confusion: RESOLVED (3rd clean run: 172829).
- tech-lead-design-reread: RESOLVED (2nd clean run: 172829).
- developer-bash-whitelist-violation: RESOLVED (2nd clean run: 172829).
- scope-unaware-doc-reads: WATCHING, first seen 172829, last seen 175521.
  Root cause identified in 175521: pipeline YAML task_template hardcodes
  "Read documents/requirements-sdlc.md and documents/design-sdlc.md" for
  architect, tech-lead, developer — overrides scope-aware prompt algorithms.
  Fix: replaced hardcoded doc refs in pipeline.yaml with "Read ONLY
  scope-relevant SRS/SDS docs". Also added scope-aware STEP 3 to PM prompt.
- developer-grep-after-read-v2: WATCHING, first seen 172829. Not seen in 175521
  (developer had 0 Grep calls). Watching for confirmation.
- qa-source-exploration: NEW, first seen 175521. QA made 9 Grep calls on
  engine/*.ts source files after reading them + ran `deno test` separately
  after `deno task check` + searched merged PRs. 33t vs target 15t.
  Fix: added HARD STOP on source code Grep, prohibited `deno test` separately,
  added `deno test` and `gh pr list --state merged` to Bash forbidden list.
- pm-file-reread: NEW, first seen 175521. PM read requirements-engine.md 4×
  (22t/$1.04 vs target 8t). Fix: added ONE READ PER FILE hard stop to PM.

## Resolved Patterns
- pm-tool-results-reread: RESOLVED (3+ clean runs)
- developer-grep-after-read: RESOLVED (3+ clean runs)
- qa-double-check: RESOLVED (3+ clean runs)
- tech-lead-write-rewrite: RESOLVED (3+ clean runs)
- developer-scope-creep: RESOLVED (2+ clean runs)
- pm-branch-shortcut-violation: RESOLVED (2 clean runs: 085155, 092842)
- pm-grep-after-read-v2: RESOLVED (pruned)
- qa-grep-after-read-v4: RESOLVED (pruned)
- qa-tool-results-path-typos: RESOLVED (pruned)
- developer-double-edit: RESOLVED (pruned)
- qa-bash-grep-v3: RESOLVED (3+ clean runs, 083240 branch)
- qa-double-deno-check: RESOLVED (083240 branch)
- qa-toolsearch: RESOLVED (3+ clean runs, 083240 branch)
- dev-toolsearch: RESOLVED (083240 branch)
- tl-toolsearch: RESOLVED (083240 branch)
- architect-git-archaeology: RESOLVED (3+ clean runs)

## Applied Fixes Log
- 20260313T021326–20260314T085155: (compressed — see git history for details)
- 20260314T092842: ALL 7 agents — resolved merge conflict markers in SKILL.md
  (root cause of persistent Skill self-invocation). developer + qa — added
  HARD STOP prohibition on reading `.claude/skills/` files (9+6 wasted Reads).
  PM prompt consolidated (removed duplicate execution algorithm, kept STEP 1-6).
  meta.md — resolved merge conflict between HEAD and origin/main branches.
- 20260314T172829: architect + tech-lead + developer — added scope-aware doc
  reading (read ONLY scope-relevant SRS/SDS based on spec frontmatter `scope:`
  field). developer — updated Grep-after-Read evidence with this run's data.
- 20260314T175521: pipeline.yaml — replaced hardcoded sdlc doc refs in
  architect/tech-lead/developer task_template with scope-aware instructions.
  PM — added scope-aware STEP 3 + ONE READ PER FILE hard stop (was reading
  requirements-engine.md 4×). QA — added HARD STOP on source code Grep (9
  calls), prohibited `deno test` separately, added to Bash forbidden list.

## Lessons Learned
- Total pipeline cost baseline for S-effort issue: ~$2.50.
- Run artifacts under .sdlc/runs/ are gitignored — agents must use `git add -f`.
- QA self-approval fails (same user can't approve own PR). Need fallback path.
- **Blacklist approach fails for Bash commands.** WHITELIST is correct.
- **Rule placement matters.** HARD STOP before Responsibilities = strongest.
- **Cross-agent patterns:** Fix in one agent, apply to ALL.
- **Positive algorithms > prohibition.** Algorithm approach works better.
- **Cost trajectory:** $5.09→$2.31→$2.24→$2.76→$4.11→$2.50→$2.88→$4.46→$5.72.
- **Scope-aware reads save ~25k tokens/agent.** Out-of-scope SRS/SDS docs add
  context that inflates cost per turn. Biggest impact on developer (most turns).
- **Scope enforcement needs explicit file path deny-lists.**
- **Merge conflicts in agent prompts are catastrophic.** They corrupt prompt
  structure — rules between conflict markers become unparseable. This was likely
  the root cause of Skill self-invocation persisting for 10+ runs despite
  escalating prohibition language. Always verify no conflict markers after merge.
- **requirements.md approaching 25k token limit.** PM hit 26k token Read error
  in 092842, causing fallback to 6 Grep calls. May need to split SRS.
- **Pre-flight checks > prohibition.** Self-check steps work better than bans.
- **Positive alternatives with exact syntax.** Providing exact Grep call syntax
  eliminates gap between "don't use bash grep" and knowing the alternative.
- **ToolSearch for built-in tools is a cross-agent anti-pattern.**
- **Background Bash is an anti-pattern for short commands.**
- **Pipeline YAML task_template overrides prompt rules.** If the task message
  explicitly says "Read file X", agents follow it even when their prompt says
  not to. Task templates must align with prompt scope-aware algorithms.
- **QA source-code Grep is exploratory waste.** QA's job is verifying
  acceptance criteria, not code review. If `deno task check` passes and files
  are read once, Grep on source adds no value.
