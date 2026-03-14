## Summary

### Files Changed

- `engine/state.ts` — `.sdlc/runs/` default → `.auto-flow/runs/`
- `engine/lock.ts` — `.sdlc/runs/.lock` default → `.auto-flow/runs/.lock`
- `engine/cli.ts` — `.sdlc/pipeline.yaml` default → `.auto-flow/pipeline.yaml` (2 occurrences)
- `engine/types.ts` — updated lock path comment
- `.auto-flow/pipeline.yaml` — prompt paths `.claude/skills/agent-*/SKILL.md` → `.auto-flow/agents/agent-*/SKILL.md`; script paths `.sdlc/scripts/` → `.auto-flow/scripts/`
- `scripts/check.ts` — pipeline path, comment-scan exclusion, test dirs updated
- `deno.json` — removed deprecated stage test tasks, updated `test:lib` path, added `.auto-flow/agents/` to fmt/lint excludes
- `.gitignore` — `.sdlc/runs/` → `.auto-flow/runs/`
- `AGENTS.md` — architecture section path refs updated
- `README.md` — project structure and CLI docs updated
- `documents/design-sdlc.md` — artifact store and agent prompt path refs updated
- `documents/requirements-sdlc.md` — Appendix B and FR path refs updated; FR-S17/S11/S24/S25 paths updated
- `.claude/settings.json` — `.sdlc/` allow patterns updated to `.auto-flow/`
- `.claude/settings.local.json` — additionalDirectories `.sdlc/tasks/` → `.auto-flow/tasks/`
- `.auto-flow/agents/agent-tech-lead/SKILL.md` — internal `.sdlc/` refs updated
- `.auto-flow/agents/agent-developer/SKILL.md` — internal `.sdlc/` refs updated
- `.auto-flow/agents/agent-qa/SKILL.md` — internal `.sdlc/` refs updated
- `.auto-flow/agents/agent-architect/SKILL.md` — internal `.sdlc/` refs updated
- `.auto-flow/agents/agent-meta-agent/SKILL.md` — internal `.sdlc/` refs updated
- `scripts/generate-dashboard_test.ts` — test data config_path updated

### Directory Operations

- `git mv .sdlc .auto-flow` — renamed pipeline directory
- `git mv .claude/skills/agent-*/ .auto-flow/agents/agent-*/` — moved 7 agent prompt dirs
- Created symlinks `.claude/skills/agent-*` → `../../.auto-flow/agents/agent-*` (7 agents)
- Deleted `.auto-flow/scripts/stage-*.sh` (9 files) per FR-S26/SDS §3.2 DEPRECATED
- Deleted `.auto-flow/scripts/stage-*_test.ts` (9 files)

### Tests Added/Modified

- `engine/state_test.ts` — updated `.sdlc/` path assertions to `.auto-flow/`
- `engine/cli_test.ts` — updated default config path assertion
- `engine/engine_test.ts` — updated config_path in makeOptions()
- `engine/pipeline_integrity_test.ts` — updated PIPELINE_PATH constant
- `engine/hitl_test.ts` — updated hitl script path refs in makeHitlConfig()
- `.auto-flow/scripts/lib_test.ts` — updated legacy artifact path in shell test

### Check Status

PASS — 422 tests pass, 0 failed. Pipeline config valid at `.auto-flow/pipeline.yaml`. Agent symlinks valid.
