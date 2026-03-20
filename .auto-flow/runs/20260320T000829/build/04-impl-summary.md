## Summary

### Files Changed

- `.auto-flow/scripts/reset-to-main.sh` — Added auto-stash block (dirty-check
  + branch display + diff stat + untracked list + `git stash push
  --include-untracked` with ISO timestamp + confirmation output) before the
  existing destructive reset ops. Clean tree: block skipped silently.

- `.auto-flow/scripts/reset-to-main_test.sh` — New shell test file; 7 tests
  covering FR-S41 acceptance criteria: clean tree no stash, dirty tree stash
  created, dirty tree output contains branch label + stash ref + restore command,
  post-stash reset HEAD lands on origin/main.

### Tests Added or Modified

- `.auto-flow/scripts/reset-to-main_test.sh` (new): 7 tests, all PASS.
  Uses temp bare + working repos for full isolation. No network required.

### deno task check

PASS — 533 tests, 0 failed. All checks passed.
