## Summary

### Files Changed

- `engine/cli.ts` — Added `VERSION` constant (reads `VERSION` env var, defaults to `"dev"`), `getVersionString()` export, and `--version`/`-V` flag handling in `parseArgs()`; updated module doc and `printUsage()`.
- `engine/cli_test.ts` — Added 2 tests: `VERSION — is a non-empty string` and `getVersionString — format is 'auto-flow v<version>'`.
- `scripts/compile.ts` — New cross-platform compile script; builds 4 targets (`x86_64-unknown-linux-gnu`, `aarch64-unknown-linux-gnu`, `x86_64-apple-darwin`, `aarch64-apple-darwin`) via `deno compile --env-file`; supports `--target <triple>` for single-target builds.
- `deno.json` — Added `"compile": "deno run -A scripts/compile.ts"` task.
- `.github/workflows/release.yml` — New release workflow triggered on `v*` tag push; matrix strategy builds all 4 targets; final job downloads artifacts and creates GitHub Release with binaries attached.
- `README.md` — Added `## Installation` section with per-platform download commands and `--version` verification step; updated Prerequisites to note binary alternative.

### Tests Added or Modified

- `engine/cli_test.ts`: 2 new tests for `VERSION` and `getVersionString()`.

### Check Status

PASS — 578 tests passed, 0 failed.
