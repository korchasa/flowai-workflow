---
variant: "Variant A: Inline help per script"
tasks:
  - desc: "Add --help/checkArgs to scripts/check.ts with printUsage() + unknown-flag detection"
    files: ["scripts/check.ts", "scripts/check_test.ts"]
  - desc: "Add --help/checkArgs to scripts/self_runner.ts with printUsage() + unknown-flag detection"
    files: ["scripts/self_runner.ts", "scripts/self_runner_test.ts"]
  - desc: "Add --help/checkArgs to scripts/loop_in_claude.ts with printUsage() + unknown-flag detection"
    files: ["scripts/loop_in_claude.ts", "scripts/loop_in_claude_test.ts"]
  - desc: "Extend scripts/generate-dashboard.ts arg handling with printUsage() + unknown-flag detection"
    files: ["scripts/generate-dashboard.ts", "scripts/generate-dashboard_test.ts"]
---

## Justification

I selected Variant A (inline help per script) for three reasons:

1. **Vision alignment:** AGENTS.md states "don't add abstractions for one-time
   operations." The 4 scripts have distinct flags, descriptions, and examples —
   the overlap is limited to the output format template (~5 lines). A shared
   module would be premature abstraction for 4 call sites with inherently
   different option sets.

2. **Lowest complexity:** S effort vs M for Variants B/C. No new module, no new
   dependency graph, no `Deno.exit()` in library code complicating unit tests.
   Each script remains self-contained and independently testable.

3. **SDS already aligned:** Both `design-engine.md` (§3.1, lines 212-217) and
   `design-sdlc.md` (§3.7 lines 268-272, §3.9 lines 299-313) already document
   the inline `printUsage()`/`checkArgs()` pattern matching Variant A. Zero SDS
   changes required.

## Task Descriptions

### Task 1: `scripts/check.ts` CLI help (FR-E23)

Add `printUsage()` function outputting: description of checks performed, usage
line (`deno task check`), note that no options are accepted (besides `--help`),
example. Add `checkArgs()` scanning `Deno.args`: `--help`/`-h` → print + exit 0;
any `--*` flag → error with `--help` reference + exit 1; no args → run checks
(backward-compatible). Insert before existing check logic in `import.meta.main`
block. Export both functions for unit testing. Add `scripts/check_test.ts` with
tests: `--help` exits 0 with usage text, unknown flag exits non-zero, no-args
backward-compatible.

### Task 2: `scripts/self_runner.ts` CLI help (FR-S26)

Add `printUsage()` describing pipeline loop runner with backoff behavior and
intervals. Usage: `deno task loop [interval] [-- claude-args...]`. Add
`checkArgs()`: `--help`/`-h` → print + exit 0; unknown `--`-prefixed flags →
error + exit 1. Insert before `while(true)` loop. Export for unit testing.
Add `scripts/self_runner_test.ts`.

### Task 3: `scripts/loop_in_claude.ts` CLI help (FR-S26)

Add `printUsage()` describing in-Claude pipeline runner and relation to
`self_runner`. Usage: `deno task loop-in-claude [claude-args...]`. `--help`/`-h`
detected before passthrough to Claude CLI. Export for testing.
Add `scripts/loop_in_claude_test.ts`.

### Task 4: `scripts/generate-dashboard.ts` CLI help (FR-S26)

Extend existing arg handling (line 388-394). Add `printUsage()` with description,
usage (`deno task dashboard --run-dir <path>`), `--run-dir` option doc, examples.
Convert bare `--run-dir` check to proper arg loop with `--help`/`-h` case and
unknown-flag detection. Export `printUsage()`/`checkArgs()` for unit testing.
Extend `scripts/generate-dashboard_test.ts`.

## Summary

I selected Variant A (inline help per script) for its minimal complexity, vision
alignment with AGENTS.md's anti-abstraction principle, and pre-existing SDS
coverage. I defined 4 dependency-free tasks — one per script (check.ts,
self_runner.ts, loop_in_claude.ts, generate-dashboard.ts) — each adding
`printUsage()` + `checkArgs()` + unit tests. Branch `sdlc/issue-112` and
draft PR #113 already exist; no new branch or PR creation needed.
