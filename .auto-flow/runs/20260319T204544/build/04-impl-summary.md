## Summary

### Files Changed

- `.auto-flow/pipeline.yaml` — changed `defaults.hitl.artifact_source` from
  hardcoded `plan/specification/01-spec.md` to template
  `"{{input.specification}}/01-spec.md"` (FR-S35 AC#1)
- `engine/hitl.ts` — added `import { interpolate } from "./template.ts"`;
  modified `buildScriptArgs()` to accept `ctx: TemplateContext` parameter and
  apply `interpolate(config.artifact_source ?? "", ctx)` before passing value
  to script args; updated both `buildScriptArgs` call sites in `runHitlLoop`
  to pass `opts.ctx`
- `scripts/check.ts` — added exported `validateHitlArtifactSource(artifactSource:
  string | undefined): string[]` pure validation function; added private
  `hitlArtifactSource()` async function that loads pipeline config, calls
  validator, exits 1 on hardcoded path; wired into main after
  `pipelineIntegrity()`; updated `printUsage()` to list the new check
- `documents/requirements-sdlc.md` — added §3.35 FR-S35 (HITL Artifact Source
  Node Reference) with description, extends note, and 7 acceptance criteria
  with evidence; added FR-S35 row to Appendix C cross-reference table
  (iteration 2 fix: PM-stage SRS persistence failure)

### Tests Added / Modified

- `engine/hitl_test.ts` — added test
  `"runHitlLoop — artifact_source template resolved via ctx"` verifying that
  `{{input.specification}}/01-spec.md` resolves to
  `/runs/abc/specification/01-spec.md` when the `TemplateContext` maps
  `specification` to `/runs/abc/specification`
- `scripts/check_test.ts` — updated import to include
  `validateHitlArtifactSource`; added 4 tests:
  valid template path passes, hardcoded path fails with artifact_source error,
  absent field (undefined) passes, empty string passes

### Check Status

PASS — 519 tests, 0 failed. All checks passed.
