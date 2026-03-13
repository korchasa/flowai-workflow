# Meta-Agent Memory

## Agent Baselines
- pm (specification): ~2 turns, ~$0.87, 134s
- architect (design): ~14 turns, ~$0.47, 64s
- tech-lead (decision): ~43 turns, ~$1.41, 275s ← REGRESSION, target ≤15
- executor (build): iter1 9t/$0.79/84s, iter2 25t/$1.03/146s ← iter2 excessive
- qa (verify): iter1 20t/$0.39/97s, iter2 14t/$0.31/62s
- Total run cost: ~$5.27 (up from $4.83 baseline)

## Active Patterns
- executor-read-overhead: RESOLVED, first seen 20260313T023047,
  last seen 20260313T161422. Build-iter-1 used only 9 turns (down from 50).
  Efficiency guidance working.
- first-pass-qa-success: FAILED, first seen 20260313T023047,
  last seen 20260313T161422. QA failed iter-1 due to external lint error
  (not impl quality). Loop ran 2 iterations.
- tech-lead-git-thrashing: NEW, first seen 20260313T161422.
  Tech-lead spent ~15 turns on git stash/checkout/reset/clean loops.
  Root cause: stash-pop conflicted with PM-modified files.
  Fix applied: simplified git workflow, added error recovery guidance.
- executor-iter2-reinvestigation: NEW, first seen 20260313T161422.
  Executor spent 25 turns on iter-2 for trivial lint fix already diagnosed
  by QA. Root cause: no QA report path in task message.
  Fix applied: added explicit QA report path and "trust QA" guidance.

## Applied Fixes Log
- 20260313T021326: pm — added CRITICAL HARD CONSTRAINT prohibiting PM from
  editing design.md → RESOLVED (confirmed in 20260313T023047: PM only wrote spec)
- 20260313T023047: executor — added efficiency guidance to reduce unnecessary
  file reads. Target: <40 turns. → RESOLVED (build-iter-1: 9 turns)
- 20260313T161422: tech-lead — simplified git workflow to avoid stash-pop
  conflicts; added error recovery guidance. Target: ≤15 turns. → WATCHING
- 20260313T161422: executor — added explicit QA report path for iteration > 1;
  added "trust QA diagnosis" guidance. Target: ≤10 turns for fix iters. → WATCHING

## Lessons Learned
- PM/SDS-update scope overlap resolved by explicit constraints in PM prompt.
- Engine loop bug (buildContext node lookup) fixed in commit f9c9983.
- Total pipeline cost baseline for M-effort issue: ~$4.83.
- Pipeline config gap: build node in impl-loop has no input from verify,
  so executor on iter > 1 can't resolve QA report path via template vars.
  Workaround: hardcoded relative path in executor prompt. Consider adding
  verify as conditional input to build in pipeline.yaml.
- Git stash-pop across pipeline nodes is fragile — earlier nodes modify
  working tree files that cause merge conflicts on pop. Prefer clean
  branch creation without stash-pop.
