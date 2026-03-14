---
variant: "Variant A: Inline printUsage per script"
tasks:
  - desc: "Add printUsage + --help/-h detection + unknown-flag error to scripts/check.ts with unit tests"
    files: ["scripts/check.ts", "scripts/check_test.ts"]
  - desc: "Add printUsage + --help/-h detection + unknown-flag error to scripts/self_runner.ts with unit tests"
    files: ["scripts/self_runner.ts", "scripts/self_runner_test.ts"]
  - desc: "Add printUsage + --help/-h detection + unknown-flag error to scripts/loop_in_claude.ts with unit tests"
    files: ["scripts/loop_in_claude.ts", "scripts/loop_in_claude_test.ts"]
  - desc: "Add printUsage + --help/-h detection + unknown-flag error to scripts/generate-dashboard.ts with unit tests"
    files: ["scripts/generate-dashboard.ts", "scripts/generate-dashboard_test.ts"]
---

## Justification

I selected Variant A (inline printUsage per script) for these reasons:

1. **Follows established pattern.** `engine/cli.ts` already implements exactly
   this pattern: `printUsage()` static string + `--help`/`-h` detection +
   unknown flag error referencing `--help`. Replicating inline keeps the
   codebase consistent without new abstractions.

2. **Minimum complexity for the task.** These are 4 scripts with 0-1 flags each.
   Variant B's shared helper module creates coupling between independent scripts
   for a pattern that consists of ~15 lines of code per script. Variant C adds a
   new vendored dependency (`@std/cli`) — more machinery than needed when flag
   sets are trivially small. Both violate the AGENTS.md principle: "avoid
   over-engineering."

3. **"Fail fast, fail clearly" alignment.** Each script owns its complete help
   text as a static string — no indirection, no imports, no shared state. If a
   script's CLI interface changes, only that script's help text changes. This
   aligns with the project vision of self-contained, domain-specific tooling.

4. **Lowest risk.** S effort vs M for both alternatives. No new files, no new
   dependencies, no shared infrastructure to maintain. The "duplication" is
   desirable — each script's usage text is unique and self-contained.

## Task Descriptions

### Task 1: `scripts/check.ts` — FR-E23

Add `printUsage()` function with: description of all checks performed, usage
line (`deno task check`), note that no options are accepted, example invocation.
Before main logic: scan `Deno.args` for `--help`/`-h` → print + `Deno.exit(0)`.
Any other arg → `Error: Unknown argument: <arg>. Use --help for usage.` +
`Deno.exit(1)`. Export `printUsage()` and `checkArgs()` for testing. Unit tests:
(a) `--help` returns expected text, (b) unknown arg returns error string.

### Task 2: `scripts/self_runner.ts` — FR-S26

Add `printUsage()` with: description (pipeline loop runner), usage line
(`deno task loop [interval] [-- claude-args...]`), options (interval, passthrough
args), examples. `--help`/`-h` detection before main logic. Unknown `--`-prefixed
flags → error + exit 1. Export helpers for testing. Unit tests: help text content,
unknown flag error.

### Task 3: `scripts/loop_in_claude.ts` — FR-S26

Add `printUsage()` with: description (run pipeline inside Claude session), usage
line (`deno task loop-in-claude [claude-args...]`), note about passthrough args,
examples. `--help`/`-h` detection (must check before passing args to claude).
Export helpers for testing. Unit tests: help text content, `--help` detection in
mixed args.

### Task 4: `scripts/generate-dashboard.ts` — FR-S26

Add `printUsage()` with: description (HTML dashboard generator), usage line
(`deno task dashboard --run-dir <path>`), options (`--run-dir`), examples.
`--help`/`-h` detection before existing `--run-dir` parsing. Unknown flags →
error + exit 1. Export helpers for testing. Unit tests: help text content,
unknown flag error, `--help` alongside `--run-dir`.

## Summary

I selected Variant A (inline printUsage per script) for its simplicity, pattern
consistency with `engine/cli.ts`, and zero new dependencies or abstractions.
I defined 4 tasks — one per script, each covering TDD implementation (test +
code) of `printUsage()`, `--help`/`-h` detection, and unknown-flag error
handling. I created branch `sdlc/issue-112` and will open a draft PR.
