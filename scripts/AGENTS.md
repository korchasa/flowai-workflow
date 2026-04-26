# Development Commands

## Shell Environment
- Always use `NO_COLOR=1` when running shell commands — ANSI escape codes waste tokens and clutter output.
- When writing scripts, respect the `NO_COLOR` env var (https://no-color.org/) — disable ANSI colors when it is set.

## Standard Interface

- `check` - The main command for comprehensive project verification. Performs
  the following steps:
  - build the project
  - comment-scan: "TODO", "FIXME", "HACK", "XXX", debugger calls, linters and
    formatters suppression
  - code formatting check
  - static code analysis
  - runs all project tests
- `test <path>` - Runs a single test.

## Detected Commands

- `deno task check` - Full project verification (format, lint, test)
- `deno task test` - Run all tests
- `deno task loop` - Autonomous loop: check issues → run workflow via Engine → repeat

> Direct `deno fmt`, `deno lint`, and `deno test` invocations are blocked by
> [`.claude/hooks/guard-deno-direct.sh`](../.claude/hooks/guard-deno-direct.sh) —
> always go through the `deno task` wrappers above.

## Command Scripts

- `scripts/check.ts` - Comprehensive check: fmt --check, lint, test,
  comment-scan
- `scripts/self-runner.ts` - Autonomous loop: check issues → run workflow via Engine (backoff 30s→4h)
