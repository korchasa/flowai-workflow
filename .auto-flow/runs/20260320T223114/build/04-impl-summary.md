## Summary

### Files Changed

- `scripts/compile.ts` — export `TARGETS` + `stripVersionPrefix`; fix platform naming
  (amd64→x86_64, macos→darwin); guard main logic with `import.meta.main`; strip `v` prefix
  from VERSION before embedding to prevent double-v output
- `scripts/compile_test.ts` — **new**: 9 unit tests for TARGETS array (4 target names),
  naming convention, and `stripVersionPrefix` behavior
- `.github/workflows/release.yml` — fix artifact names to match spec
  (x86_64 replaces amd64, darwin replaces macos)
- `README.md` — fix 2 binary names in Installation section (linux-x86_64, darwin-arm64)
- `documents/requirements-engine.md` — add §3.39 FR-E39 (Standalone Binary Distribution)
  with 7 acceptance criteria + Appendix row

### Tests Added / Modified

- `scripts/compile_test.ts` (new): 9 tests — TARGETS count, 4 target name mappings,
  naming convention check, `stripVersionPrefix` (3 cases: v-prefix, no-prefix, dev)

### deno task check

PASS — 587 tests, 0 failures
