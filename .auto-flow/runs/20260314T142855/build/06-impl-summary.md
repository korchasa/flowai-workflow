## Summary

### Files Changed

- **`documents/design-sdlc.md`** — Both changes were applied by the Tech Lead agent in commit `768ceef` as part of the decision step (standard SDS update responsibility):
  - §2.1: Replaced legacy 9-stage Mermaid `graph LR` block with compact tombstone. Updated section heading from `DEPRECATED — pre-FR-26` to `REMOVED — superseded by FR-S15`.
  - §3.2: Rewrote Stage Scripts section to explicitly list 9 legacy `test:*` deno.json tasks with DEPRECATED label and superseding reference to `deno task run`.

### Tests Added or Modified

None. Changes are documentation-only (SDS cleanup per FR-S23). No source code or test files modified.

### Check Status

PASS — `deno task check` completed with 490 tests passed, 0 failed. Formatting, linting, secret scan, pipeline integrity, and comment scan all clean.
