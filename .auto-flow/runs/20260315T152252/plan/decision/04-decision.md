---
variant: "Variant B: Assert return value + verify file still absent"
tasks:
  - desc: "Add assertEquals + Deno.stat assertions to releaseLock no-file test"
    files: ["engine/lock_test.ts"]
---

## Justification

I selected Variant B because it provides the strongest behavioral coverage with minimal code. The `assertEquals(await releaseLock(lockPath), undefined)` satisfies FR-E27's assertion requirement, while the `Deno.stat` file-absence check guards against a regression where `releaseLock` might inadvertently create or touch the lock path. This mirrors the existing pattern at `lock_test.ts:122-138` ("releaseLock — removes lock file" test), maintaining consistency within the test file.

Variant A's `assertEquals(undefined, undefined)` is tautologically true for any `void`-returning async function — it only confirms "doesn't throw," which `await` already guarantees by not rejecting. Variant C's try/catch + `fail()` is redundant with Deno's test runner behavior (unhandled rejection = test failure).

This aligns with the project vision's emphasis on code quality and "fail fast, fail clearly" (AGENTS.md) — tests should assert meaningful behavior, not just compile.

## Task Descriptions

### Task 1: Add assertEquals + Deno.stat assertions to releaseLock no-file test

Target: `engine/lock_test.ts:140-148` — test "releaseLock — no error if lock file already removed."

Changes:
1. Replace bare `await releaseLock(lockPath)` with `assertEquals(await releaseLock(lockPath), undefined)`.
2. Add file-absence verification: call `Deno.stat(lockPath)`, assert it throws with `NotFound` error. Use the same `assertRejects` or try/catch pattern already present in the preceding test case.
3. Add `assertEquals` import if not already present (likely already imported).

Single file, single test function. No new dependencies. TDD flow: test already exists (RED state — missing assertion), add assertions (GREEN), verify with `deno task test`.

## Summary

I selected Variant B for its genuine behavioral coverage beyond the tautological void-return check. I defined 1 atomic task targeting `engine/lock_test.ts:140-148`. I created branch `sdlc/issue-88` and opened a draft PR.
