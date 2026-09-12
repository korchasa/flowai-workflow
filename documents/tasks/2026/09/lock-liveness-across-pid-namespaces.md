---
date: "2026-09-12"
status: in progress
implements: [FR-E54, FR-E102]
tags: [engine, lock, kubernetes, liveness, isolation]
related_tasks: [2026/05/per-workflow-run-lock.md]
---

# Lock liveness across PID namespaces

## Goal

A workflow lock left behind by a process that died in another PID namespace
is detected as stale and reclaimed automatically, without a human deleting
`runs/.lock` by hand. Liveness must be proven by the holder, not inferred
from a PID number that means nothing outside the namespace that issued it.

## Overview

### Context

Reported by the ratatoskr production instance (session `ratatoskr-fe`),
`pets.lan` / namespace `ratatoskr`, CronJob `ratatoskr-feed`, hourly,
`concurrencyPolicy: Forbid`. The runs directory is a node hostPath
(`/srv/ratatoskr/feed/runs/`) mounted into each pod at
`/app/.flowai-workflow/news/runs`. Engine invoked as
`deno run -A jsr:@korchasa/flowai-workflow@^0.10.0 run .flowai-workflow/news`.

On 2026-09-11 01:00 UTC run `20260911T010001` reached node `write`
(01:04:25) and was cut off when the node rebooted at 01:22 and 01:31; pod
`ratatoskr-feed-29818140-qqf75` died with it. The lock file survived:

```json
{
  "pid": 12,
  "hostname": "ratatoskr-feed-29818140-qqf75",
  "run_id": "20260911T010001",
  "started_at": "2026-09-11T01:00:01.187Z"
}
```

Every subsequent hourly run then failed in under a second with

```
Error: Workflow is already running (run_id: 20260911T010001, pid: 12, host: ratatoskr-feed-29818140-qqf75). Remove .flowai-workflow/news/runs/.lock manually if the process is stuck.
```

for roughly 40 hours / 39 consecutive runs. Noticed only because the blog
stopped publishing. It could not self-heal: PID 12 in each *new* pod is an
unrelated live process, so the liveness probe answered "alive" forever and
`acquireLock`'s stale-reclaim branch never ran. The reporter cleared the
lock by hand (backup at `/tmp/ratatoskr-feed.lock.bak` on the node) and the
pipeline resumed.

### Current State

- `src/state/lock.ts:35-40` `isProcessAlive(pid)` sends
  `Deno.kill(pid, "SIGCONT")` and reports alive for every error except
  `Deno.errors.NotFound`. Only `ESRCH` proves death.
- `src/state/lock.ts:69-73` `isLockAlive(existing)` is exactly
  `isProcessAlive(existing.pid)`. Its JSDoc states the false premise
  verbatim: "lock file on local FS guarantees PID namespace is shared.
  Hostname stored for diagnostics only."
- The premise fails whenever the runs directory outlives the process
  namespace: Kubernetes hostPath/PVC, docker with a volume,
  systemd-nspawn, or a host reboot with the lock on a network or shared
  disk. The directory is shared; the PID namespace is not.
- `hostname` is already written into every lock file and never read by any
  decision path.
- The same probe is duplicated by hand in `scripts/sdlc-status.ts:56-63`
  (`pidAlive`), with its own local `LockInfo` type — invisible to a symbol
  search on `isProcessAlive`.
- `src/mcp/mcp-server.ts:409-441` `cancel_run` reads the lock and calls
  `Deno.kill(info.pid, "SIGTERM")` with no host check. Cross-namespace this
  signals an unrelated local process that happens to hold that PID — the
  same false premise pointed the other way, and destructive rather than
  merely blocking.
- Existing tests plant `hostname: "test"` next to a live `Deno.pid` and
  assert "alive": `src/mcp/commands_test.ts:190-191`,
  `src/mcp/mcp-server_test.ts:361-362` and `:394-397`,
  `scripts/sdlc-status_test.ts:44-48`. These fixtures encode the assumption
  under test and must be updated in lockstep, not worked around.

### Constraints

- Reclaiming a lock still held by a live run is the destructive failure:
  two engines would share one worktree. The existing code deliberately
  prefers "assume alive" on an unprovable answer; any new rule must keep a
  live holder safe, including one on a genuinely different machine sharing
  the directory over NFS.
- The engine is domain-agnostic. No Kubernetes-specific logic, no API
  server calls, no container detection in engine code.
- `EngineOptions.lock_path` override (test-only) keeps precedence.
- Backward compatibility: locks written by already-released binaries carry
  no new field and must still be classifiable.
- Any periodic work added to a run must be torn down on every exit path —
  normal completion, failure, and signal shutdown — or it leaks a timer
  into embedding hosts (FR-E59/E60 library-embedding readiness).

### Affected Surface

Scout report, verbatim:

```
## Surface

- `src/state/lock.ts:35-40` (`isProcessAlive`) — the root-cause function: `Deno.kill(pid, "SIGCONT")`, treats everything but `Deno.errors.NotFound` as "alive". This is the single staleness check exercised by `isLockAlive`, `isRunLive`, and `liveLockHolder` below — evidence: function body and its call sites in the same file.
- `src/state/lock.ts:69-73` (`isLockAlive`) — comment states the false assumption verbatim: "Always checks PID directly — lock file on local FS guarantees PID namespace is shared." Consumed by `acquireLock`'s stale-reclaim branch (line 170) — the exact branch that never fires in the bug report.
- `src/state/lock.ts:82-95` (`isRunLive`) — same `isProcessAlive(info.pid)` check, used by MCP `get_state`/`answer`-adjacent tooling (`src/mcp/commands.ts:101`) to tell an operator whether a run is live. Same false-positive risk cross-pod.
- `src/state/lock.ts:97-114` (`liveLockHolder`) — same check again, used by `src/mcp/commands.ts:224` and `:321` as the pre-flight gate before `start_run`/`resume_node`. A false "alive" here blocks MCP-driven resume the same way it blocked the CronJob's next run.
- `src/state/lock.ts:131-186` (`acquireLock`) — the function that produced the exact symptom in the report: on `AlreadyExists` it calls `isLockAlive`, gets a false "yes", and throws the "Workflow is already running... Remove ... manually" error every invocation hits.
- `src/mcp/mcp-server.ts:408-441` (`cancel_run` tool, `registerCancelRun`) — reads `LockInfo` and does `Deno.kill(info.pid, "SIGTERM")` directly against the lock's stored PID, with no hostname/liveness cross-check beyond catching `NotFound`/`PermissionDenied`. Under the same K8s-hostPath scenario this can send SIGTERM to an unrelated process reusing that PID in the current pod — a second consumer of the same false assumption, in the opposite direction (kill instead of reclaim).
- `scripts/sdlc-status.ts:28-33,56-63,155-168` (`LockInfo` interface + `pidAlive`) — an independent, hand-duplicated copy of the exact same liveness probe: `Deno.kill(pid, "SIGCONT")`, catch → false, otherwise alive. It has its own `LockInfo` type (with an added `alive` field) rather than importing from `src/state/lock.ts`. This is exactly the "parallel implementation, no shared identifier, invisible to a symbol search on `isProcessAlive`" case — it must be fixed in lockstep with `lock.ts` or the SDLC status reporter will keep reporting a dead-in-reality lock as alive even after the engine's own check is fixed.
- `src/state/lock_test.ts` — the existing regression-locked test suite for `lock.ts`; whatever new hostname-aware/heartbeat-based staleness logic is added needs new test cases here (K8s-shaped: same hostname+live PID vs. different hostname/pod-restart, PID-reused-by-unrelated-process scenario cannot literally be simulated but the design should be testable via injected clock/heartbeat).
- `documents/design-engine/03-subsystems.md:132-171` (section "3.3a Workflow Lock (`lock.ts`) — FR-E25, FR-E54") — documents the same false assumption as design fact: "Hostname stored for diagnostics only — local FS implies a shared PID namespace, so `Deno.kill(pid, 'SIGCONT')` is the authoritative liveness check." This text must change alongside the code or the design doc will contradict the fix.
- `documents/requirements-engine/04b-worktree-isolation.md:159-193` (section "3.54 FR-E54: Per-Workflow Run Lock") — the SRS entry for this lock; likely needs an acceptance-criterion update for stale-lock detection without a shared PID namespace, and its `Tests:` line references `lock_test.ts`, tying it to the same test file above.
- `src/engine/engine.ts:324,329,342` — `acquireLock`/`releaseLock` call sites (lock acquired at run start, released on shutdown/completion). Not a place the staleness logic lives, but the place whose behavior the bug report describes end-to-end (pod dies between acquire and release, lock file survives). Confirmed unaffected as an implementation site — the fix is entirely inside `lock.ts`'s staleness predicate, not in how/when engine.ts calls it — but any heartbeat-refresh design (a common fix shape for this class of bug) would need a periodic touch of the lock file from within the running engine, which would land here.
- `documents/tasks/2026/05/per-workflow-run-lock.md` — the original decision task for FR-E54; not modified by this task itself, but is background context the fix should reference/link from a new decision task per the project's "Key Decisions" convention (`AGENTS.md`/`CLAUDE.md` "Key Decisions" section), since a materially different staleness model is itself an architectural decision worth its own task file.

## Queries used
- `ls` on repo root and `src/state/`; read `src/state/lock.ts` in full.
- `grep -rln "state/lock"` across `src scripts documents plugin-src`.
- `grep -rn "isProcessAlive|isLockAlive|acquireLock|releaseLock|liveLockHolder|isRunLive|LockInfo"` across `src scripts` (excluding `_test.ts`).
- `grep -rln "FR-E54"` across `documents`.
- Read `scripts/sdlc-status.ts` (header, `LockInfo`, `pidAlive`, `loadWorkflowStatus`).
- Read `src/mcp/mcp-server.ts:390-445` (`cancel_run` tool).
- `grep -n "lock|PID|pid|hostname"` in `documents/requirements-engine/04-runtime-and-hooks.md` and `documents/design-engine/03-subsystems.md`.
- `grep -n "FR-E25|FR-E54"` across `documents/requirements-engine.md` and `documents/requirements-engine/*.md`.

## Not examined (budget)
- `src/mcp/commands.ts` and `src/mcp/commands_test.ts` full bodies (only grepped for the two `liveLockHolder`/`isRunLive` call sites, lines 101/223-224/321) — did not read surrounding logic to confirm no further lock-liveness assumptions.
- `src/mcp/mcp-server_test.ts`, `src/mcp/commands_test.ts` — did not check whether existing tests encode the shared-PID-namespace assumption as fixtures (e.g. asserting `cancel_run`/`get_state` behavior against a same-host live PID) that a fix would need to extend, not just `lock_test.ts`.
- `documents/tasks/2026/07/native-run-observer-app.md` and `documents/tasks/2026/06/add-mcp-start-run.md` — both matched the `state/lock` grep but were not opened; unclear whether they encode the shared-PID assumption as a design constraint.
- `documents/tasks/2026/05/engine-singleton-guard.md`, `documents/tasks/2026/05/isolation-provider.md`, `documents/tasks/2026/05/isolation-provider-plugin.md`, `documents/tasks/2026/05/workflow-triggers.md`, `documents/tasks/2026/05/worktree-frs-consolidation.md`, `documents/tasks/2026/05/remove-git-from-engine.md`, `documents/tasks/2026/07/review-fixes-security-and-fail-fast.md` — all matched `FR-E54` grep but not opened; likely mostly historical/unrelated but not confirmed.
- `documents/requirements-engine/01-execution-model.md` §3.25 (FR-E25 Graceful Shutdown) — not opened; may define signal-handling semantics relevant to a heartbeat-based or graceful-lock-release fix.
- The sibling `@korchasa/ai-ide-cli` repo — out of scope by symptom (this is engine-side lock logic, not ACP runtime), not checked.
- Did not check `.flowai-workflow/*/runs/.lock` or any live/example lock files in-repo for current on-disk shape beyond the `LockInfo` type definition.

## Could not rule out
- Whether `src/mcp/commands.ts` contains additional, unlisted call sites of the staleness check beyond the three grepped lines (101, 224, 321) — the grep was symbol-based and would miss a re-exported alias.
- Whether other scripts under `scripts/` (beyond `sdlc-status.ts`) read `runs/.lock` directly with their own ad-hoc parsing — only `sdlc-status.ts` surfaced via the `LockInfo`/`isProcessAlive` grep; a script reading the raw JSON without naming a `LockInfo` type would not match that search.
```

Dispositions (union of the scout's list and this session's own enumeration):

- `src/state/lock.ts` `isProcessAlive` — covered-by DoD 1 (becomes the same-host branch of a two-branch predicate; its semantics are kept, its authority narrowed).
- `src/state/lock.ts` `isLockAlive` — covered-by DoD 1 (the single predicate every consumer routes through; its false-premise JSDoc is rewritten).
- `src/state/lock.ts` `isRunLive` — covered-by DoD 2 (routed through the shared predicate instead of a bare PID probe).
- `src/state/lock.ts` `liveLockHolder` — covered-by DoD 2 (same).
- `src/state/lock.ts` `acquireLock` — covered-by DoD 1 and DoD 3 (the reclaim branch that never fired, and the error text an operator reads when it legitimately does not fire).
- `src/mcp/mcp-server.ts` `cancel_run` — covered-by DoD 4 (refuses to signal a PID it cannot prove belongs to this namespace).
- `scripts/sdlc-status.ts` `pidAlive` + local `LockInfo` — covered-by DoD 5 (imports the shared predicate; the duplicate is deleted).
- `src/state/lock_test.ts` — covered-by DoD 1, 2, 3 (new cases; the clock/identity seam is what makes them writable).
- `src/mcp/commands_test.ts:190-191` fixture (`hostname: "test"` + live `Deno.pid`, asserts live) — covered-by DoD 2. Found by this session, not in the scout list; the scout named this file as un-examined.
- `src/mcp/mcp-server_test.ts:361-362` fixture — not affected — the assertion fires on the `run_id` mismatch branch, which returns before any liveness or host check. Verified by reading `registerCancelRun`: the `info.run_id !== run_id` guard precedes `Deno.kill`.
- `src/mcp/mcp-server_test.ts:394-397` fixture (`hostname: "test"` + ghost PID, asserts `cancelled: false`) — covered-by DoD 4; the reason string changes when the host gate answers first.
- `scripts/sdlc-status_test.ts:44-48` fixture — covered-by DoD 5.
- `documents/design-engine/03-subsystems.md` §3.3a — covered-by DoD 6.
- `documents/requirements-engine/04b-worktree-isolation.md` §3.54 — covered-by DoD 6.
- `src/engine/engine.ts:324,329,342` — covered-by DoD 7 and Solution step 2; the selected variant starts a renewal handle right after `acquireLock` and tears it down before `releaseLock` on every exit path.
- `documents/tasks/2026/05/per-workflow-run-lock.md` — not affected — it is the FR-E54 decision record and stays as written history; this file is the new decision record and links to it via `related_tasks`.
- Other `scripts/` readers of raw `.lock` JSON (scout could not rule out) — not affected — `grep -rn '/\.lock' src scripts plugin-src --include='*.ts'` returns only `lock.ts`, `types.ts` (a JSDoc mention), `sdlc-status.ts`, and three test files. No further ad-hoc reader exists.
- Additional `commands.ts` liveness call sites (scout could not rule out) — not affected — `grep -rn 'isRunLive\|liveLockHolder' src` returns exactly lines 101, 224 and 321 plus the import; there is no re-exported alias.
- `documents/tasks/2026/07/native-run-observer-app.md`, `documents/tasks/2026/06/add-mcp-start-run.md` — deferred — human choice; they matched a path grep only and neither is a code site.
- `documents/requirements-engine/01-execution-model.md` §3.25 (FR-E25 Graceful Shutdown) — covered-by DoD 7 and Solution step 2. The scout flagged it as un-examined and specific to a heartbeat design, and it is: its Description already promises that a signal runs "shutdown callbacks (lock release, state save)", and its Motivation names "stale lock files blocking subsequent runs" as the reason the mechanism exists. Solution step 2 inserts renewal teardown into exactly that callback chain, so §3.25's acceptance bullet about `engine.ts` registering shutdown callbacks after lock acquisition is restated to include stopping renewal before release.
- `src/state/lock_test.ts:117-139` — covered-by DoD 1 and Solution step 5; the single currently-green case that inverts under the lease.
- `scripts/sdlc-status_test.ts:175-181` — covered-by Solution step 5 as a type-compatibility check only; the fixture asserts rendering, not liveness.
- `documents/requirements-engine.md` FR-ID → section-file map — covered-by DoD 10.
- `documents/tasks/2026/05/engine-singleton-guard.md`, `isolation-provider.md`, `isolation-provider-plugin.md`, `workflow-triggers.md`, `worktree-frs-consolidation.md`, `remove-git-from-engine.md`, `2026/07/review-fixes-security-and-fail-fast.md` — not affected — they matched a text grep for the string `FR-E54`, and none is a code site or a live contract; committed task records are written history that later work links to rather than edits, the same disposition as the FR-E54 decision record above.

## Definition of Done

- [x] **DoD 1** A lock whose `hostname` differs from the current host is never judged
      alive on the strength of its PID alone.
      FR-E102. Test: `src/state/lock_test.ts::FR-E102 acquireLock — a foreign-host lock is not kept alive by a live local PID`.
      Evidence: `deno task check`.
- [x] **DoD 2** `isRunLive`, `liveLockHolder` and `acquireLock` give the same verdict
      for the same lock file, because all three call one predicate.
      FR-E102. Test: `src/state/lock_test.ts::FR-E102 lock liveness — isRunLive, liveLockHolder and acquireLock agree on a foreign-host lock`.
      Evidence: `deno task check`.
- [x] **DoD 3** A live holder is still protected: a lock the current host's own live
      process holds is never reclaimed, and neither is a foreign-host lock
      whose holder is still renewing.
      FR-E102. Test: `src/state/lock_test.ts::FR-E102 acquireLock — a foreign-host holder that still renews is not reclaimed`.
      Evidence: `deno task check`.
- [x] **DoD 4** `cancel_run` does not signal a PID it cannot attribute to the current
      namespace; it reports why instead.
      FR-E102. Test: `src/mcp/mcp-server_test.ts::FR-E102 cancel_run refuses to signal a foreign-host lock holder`.
      Evidence: `deno task check`.
- [x] **DoD 5** `scripts/sdlc-status.ts` reports liveness through the shared predicate;
      its local `pidAlive` and duplicate `LockInfo` are gone.
      FR-E102. Test: `scripts/sdlc-status_test.ts::FR-E102 loadWorkflowStatus reports an expired foreign-host lock as not alive`.
      Evidence: `deno task check`.
- [ ] **DoD 6** SRS §3.54 and SDS §3.3a no longer state that the hostname is
      diagnostic-only or that a local filesystem implies a shared PID
      namespace.
      FR-E102. Test: manual — korchasa.
      Evidence: `git diff documents/requirements-engine/04b-worktree-isolation.md documents/design-engine/03-subsystems.md`.
- [x] **DoD 7** Renewal stops for good when the holder stops it: after `stop()` the
      `renewed_at` stamp never advances again, including from a tick already
      in flight, and no timer is left behind for an embedding host.
      FR-E102. Test: `src/state/lock_test.ts::FR-E102 startLockRenewal — after stop() the stamp never advances again`.
      Evidence: `deno task check`.
- [x] **DoD 8** The reported scenario is reproduced as a regression test: a lock file
      naming a foreign host and a PID that is live locally is reclaimed by
      the next `acquireLock`.
      FR-E102. Test: `src/state/lock_test.ts::FR-E102 acquireLock — reclaims the ratatoskr k8s lock (foreign host, locally-live PID)`.
      Evidence: `deno task check`.
- [x] **DoD 9** A running holder keeps proving liveness: `renewed_at` advances while
      the run is alive, so a foreign observer sees a fresh lease.
      FR-E102. Test: `src/state/lock_test.ts::FR-E102 startLockRenewal — advances renewed_at while the holder runs`.
      Evidence: `deno task check`.
- [ ] **DoD 10** FR-E102 exists in the SRS with a filled `Acceptance criteria` field as
      the section's last bullet, FR-E54's constraint list no longer claims
      the hostname is diagnostic-only, and the FR-ID → section map in
      `documents/requirements-engine.md` carries an FR-E102 row.
      FR-E102. Test: manual — korchasa.
      Evidence: `deno task check` (the `frCanonicalFields`, `docsTokenBudget`
      and FR-map gates in `scripts/check.ts`).
- [x] **DoD 11** A run never deletes a lock it no longer owns. Releasing checks
      ownership first, so a holder that lost its lease cannot free the folder
      out from under the run that reclaimed it.
      FR-E102. Test: `src/state/lock_test.ts::FR-E102 releaseLockIfOwned — leaves a lock reclaimed by another run intact`.
      Evidence: `deno task check`.
- [x] **DoD 12** Losing the lease stops the run rather than letting two runs share one
      worktree. When renewal finds the lock taken over, the run fails with a
      clear error instead of continuing.
      FR-E102. Test: `src/state/lock_test.ts::FR-E102 startLockRenewal — reports loss of ownership to its owner`.
      Evidence: `deno task check`.
- [x] **DoD 13** A reused PID on the same host after a reboot does not keep a dead lock
      alive: a same-host lock that carries a renewal stamp must have a fresh
      one, not merely a live PID.
      FR-E102. Test: `src/state/lock_test.ts::FR-E102 acquireLock — a same-host lock with a live PID but an expired lease is reclaimed`.
      Evidence: `deno task check`.
- [x] **DoD 14** A stamp implausibly far in the future cannot hold a lock open: clock
      skew beyond the lease window classifies the lock as unusable rather
      than alive.
      FR-E102. Test: `src/state/lock_test.ts::FR-E102 lock liveness — a stamp beyond the lease window in the future is not alive`.
      Evidence: `deno task check`.

## Solution

Selected variant: heartbeat lease plus host gate. Liveness stops being
inferred from a PID and becomes something the holder must keep proving.
New contract is FR-E102; FR-E54 keeps the path and scope rules and loses
the sentence that made the hostname diagnostic-only.

### 1. `src/state/lock.ts` — the lease contract

- `LockInfo` gains `renewed_at?: string`. Optional, because locks written
  by already-released binaries do not have it.
- Two exported constants, both with JSDoc: `LOCK_RENEW_INTERVAL_MS = 15_000`
  and `LOCK_LEASE_MS = 45_000`. The lease is three renewal intervals wide so
  a single failed write is never fatal.
- `isProcessAlive` keeps its current body and its `PermissionDenied`
  reasoning. What changes is its authority, not its behaviour.
- New exported `isLockHolderAlive(info: LockInfo, now?: number): boolean`,
  replacing the private `isLockAlive`. Three arms, in this order:
  - **Same host** (`info.hostname === undefined || info.hostname ===
    Deno.hostname()`). A dead PID answers dead immediately — that keeps
    same-host crash detection instant instead of making it wait out a
    lease. A live PID is then qualified by the stamp: no `renewed_at`
    means a lock written by a pre-FR-E102 binary, so the PID alone
    decides, exactly as today; a present `renewed_at` must also be
    fresh. That second half is what closes the reboot case — after a
    reboot the hostname is unchanged, so a reused PID would otherwise
    recreate the jam on a local or shared disk.
    The `undefined` arm is not cosmetic. `readLockInfo` validates only
    `pid` and `run_id`, so a lock with no `hostname` at all is a shape
    the code already accepts, and `lock_test.ts::acquireLock — reclaims
    lock without hostname field (backward compat)` pins it to the PID
    branch. Treating an unknown host as local is strictly no worse than
    today's behaviour.
  - **Foreign host.** The PID means nothing here, so only the stamp
    counts: `info.renewed_at ?? info.started_at`, judged by the lease
    rule below.
  - **Lease rule** (shared by both arms). Parse the stamp; an
    unparseable one is debris and answers dead. Then take
    `delta = now - parsed`. A stamp further than `LOCK_LEASE_MS` into
    the *future* answers dead as well: no correctly-clocked live holder
    can be that far ahead, and admitting it would let a fast clock on a
    dead node hold the folder for the whole skew — which is the reported
    39-failed-runs symptom rebuilt out of different parts. Otherwise
    alive iff `delta < LOCK_LEASE_MS`, which still tolerates the few
    seconds of ordinary NTP drift.

- `acquireLock`, `isRunLive` and `liveLockHolder` all call that one
  function, so the three answers cannot diverge. `acquireLock` writes
  `renewed_at` equal to `started_at` when it creates the file.
- New exported `startLockRenewal(lockPath, info, opts?): LockRenewal`,
  where `LockRenewal` is `{ stop(): void }`:
  - `setInterval` at `opts?.intervalMs ?? LOCK_RENEW_INTERVAL_MS`, passed
    to `Deno.unrefTimer` so it never holds a process open.
  - The handle carries a `stopped` flag. Every tick re-checks it after
    each `await`, not only on entry: `stop()` alone is a synchronous
    `clearInterval`, which cannot recall a tick already past its read.
    Without the flag that tick would `rename` the file back into place
    after `releaseLock` ran.
  - Each tick re-reads the lock. If the file is gone, or its `run_id`,
    `pid` or `hostname` are no longer ours, the handle stops itself and
    calls the caller's `onLost` — it must never resurrect a released
    lock nor overwrite one another run legitimately took.
  - Otherwise it writes `{...info, renewed_at: <now>}` to a sibling temp
    file and `Deno.rename`s it into place. Creation uses `Deno.link` and
    cannot overwrite; renewal must overwrite, so it uses rename. Both are
    atomic; the JSDoc says why the two paths differ.
  - Transient read and write failures are swallowed and retried on the
    next tick. Losing ownership is the only condition that stops renewal.
  - `stop()` sets the flag, clears the interval, and is idempotent.
- New exported `releaseLockIfOwned(lockPath, info): Promise<void>` — reads
  the lock and unlinks it only when `run_id`, `pid` and `hostname` still
  match the caller. Plain `releaseLock` stays unconditional, because
  `acquireLock` uses it to drop debris it has just judged dead; the engine
  switches to the owned variant. Without this split the lease opens a path
  the Constraints call the destructive failure: a holder whose lease
  expired, whose folder another run then took, would delete that other
  run's lock on its way out and free the folder for a third.

### 2. `src/engine/engine.ts` — renewal lifecycle

- Start the handle immediately after `acquireLock` (line 324).
- Register `onShutdown(() => renewal.stop())` before the existing
  `onShutdown(() => releaseLock(lockPath))` so the signal path stops
  renewing before it unlinks.
- In the existing `finally`, call `renewal.stop()` before releasing, and
  release through `releaseLockIfOwned`. Order matters: a tick between
  release and stop would recreate the file the run just gave up.
- Pass an `onLost` callback that fails the run. Losing the lease means
  another run may already own this workflow folder, so continuing to write
  into the shared worktree is the two-holders failure the Constraints
  forbid. The engine marks the run failed with a message naming the run
  that took over, and lets the existing shutdown path unwind — the
  project's fail-fast rule, applied to the one condition the lease
  introduces.

### 3. `src/mcp/mcp-server.ts` — `cancel_run` refuses cross-namespace signals

- After the `run_id` guard and before `Deno.kill`, refuse when
  `info.hostname !== Deno.hostname()` with a message naming the holder's
  host. Signalling a PID from another namespace does not cancel the run,
  it hits whatever local process happens to hold that number.

### 4. `scripts/sdlc-status.ts` — delete the duplicate

- Remove the local `pidAlive` and the local `LockInfo`. Import
  `type LockInfo` and `isLockHolderAlive` from `../src/state/lock.ts`.
  The status-facing type becomes `LockInfo & { alive: boolean }`, so the
  reporter and the engine can no longer disagree about the same file.

### 5. Tests — RED before GREEN

New cases in `src/state/lock_test.ts`:

- foreign host, locally-live PID, stale `renewed_at` — reclaimed (DoD 1, 8)
- foreign host, locally-live PID, fresh `renewed_at` — refused (DoD 3)
- `isRunLive`, `liveLockHolder` and `acquireLock` agree on one file (DoD 2)
- `startLockRenewal` advances `renewed_at` (DoD 9)
- `stop()` leaves no pending timer and no resurrected file (DoD 7)

The op sanitizer in `deno test` fails on a leaked interval by itself, so
DoD 7 needs no extra instrumentation.

Existing fixtures are corrected, not worked around. One of them genuinely
inverts under the new predicate and must change:

- `src/state/lock_test.ts:117-139` (`acquireLock — reclaims stale lock from
  different host (dead PID)`) writes a foreign hostname, a dead PID and a
  `started_at` of *now*. Under the lease the foreign arm ignores the PID and
  reads the stamp, which is fresh, so the lock is judged alive and the test
  fails. Its intent — a lock from another host whose holder is gone gets
  reclaimed — survives; the signal for "gone" changes from a dead PID to an
  expired lease. Rewrite it with a stamp older than `LOCK_LEASE_MS` and
  rename it to `FR-E102 acquireLock — reclaims an expired foreign-host
  lock`. It is the only currently-green `lock_test.ts` case that inverts;
  the other same-host cases carry no `renewed_at` and keep taking the PID
  arm unchanged.

The remaining fixtures still pass but assert the right thing for the wrong
reason, so they are corrected too:

- `src/mcp/commands_test.ts:190-191` — `hostname: "test"` becomes
  `Deno.hostname()`; the test's subject is the inbox handoff, not the gate.
- `src/mcp/mcp-server_test.ts:394-397` — same change, so the ghost-PID case
  still exercises the "process already gone" path; a new test covers the
  foreign-host refusal (DoD 4).
- `scripts/sdlc-status_test.ts:44-48` — same change, plus a new case for an
  expired foreign-host lock reported as not alive (DoD 5).
- `scripts/sdlc-status_test.ts:175-181` — a `hostname: "h"` fixture that is
  input data for a rendering assertion, not a liveness one; it carries its
  own `alive: true`. It compiles against the imported `LockInfo` once the
  duplicate type is deleted, so it needs no behavioural change — only a
  type-compatibility check when step 4 lands.
- `src/mcp/mcp-server_test.ts:361-362` is left alone. Its assertion fires
  on the `run_id` mismatch branch, which returns before any host check.
- `src/state/lock_test.ts::acquireLock — reclaims lock without hostname
  field (backward compat)` is left alone and must stay green unmodified.
  It is the regression guard for the `undefined` arm above.

### 6. Documentation

- `documents/requirements-engine/04b-worktree-isolation.md` — add
  §3.59 FR-E102. The last bullet must be `Acceptance criteria`, spelled
  exactly that way: `scripts/check.ts` `FR_CANONICAL_ORDER` rejects any
  other field name, `documents/CLAUDE.md` lists bare `Acceptance` as a
  removed typo, and the same file requires `Acceptance criteria` to come
  last, after every optional field. Amend FR-E54's constraint line that
  reads "hostname stored for diagnostics only". The file is 17 KB against
  a budget of roughly 27 KB, so it has room.
- `documents/requirements-engine.md` — add an FR-E102 row to the
  FR-ID → section-file map. The map currently ends at FR-E101; without the
  row the new FR is unreachable by the project's read protocol, which
  routes every lookup through that table.
- `documents/design-engine/03-subsystems.md` — rewrite §3.3a. The
  sentence "local FS implies a shared PID namespace" is the design fact
  this task falsifies. The file is 22 KB, closer to the budget; if the
  rewrite pushes it over, split the lock subsection into its own file
  rather than compressing the text.
- `documents/index.md` — FR-E102 row under `## FR`.
- `AGENTS.md` Key Decisions — one line linking this task.

### 7. Verification

```
deno task check
```

One run, full log, then slice it:

```
deno task check > "$SCRATCH/check.log" 2>&1; echo "EXIT: $?"
```

### 8. Known migration window

A lock written by a pre-FR-E102 binary on another host has no `renewed_at`,
so it falls back to `started_at` and becomes reclaimable once that stamp is
older than the lease. That is deliberate: it is what lets an upgraded binary
clear the jammed ratatoskr lock without a human. The cost is narrow and
temporary. Two hosts sharing one runs directory while both still run old
binaries would stop serializing against each other during the window
between upgrading one and upgrading the other. Nothing in the project
supports that layout today, and the alternative is that the upgrade does
not fix the reported jam.

## Follow-ups

- Lock provider interface (variant 3, not selected): extract acquire /
  renew / release / inspect behind `EngineOptions` so a host can supply a
  Kubernetes `Lease` or Redis implementation. Deferred — the file lease
  built here is what its default implementation would be, so it layers on
  later without rework.
- Age-threshold reclaim (variant 1, not selected) is subsumed: the lease
  is the same idea with the guesswork removed.
- Losing the lease fails the run but does not abort nodes already in
  flight: `Engine.run()` records the loss and throws once the graph
  finishes. During that overlap two engines can still be writing the same
  worktree. Closing it needs an abort signal threaded through the
  scheduler, which is a larger change than this task, and the run at least
  no longer reports success. Worth its own task if the overlap shows up in
  practice.
- Lease constants are not derived from the reporting deployment. The
  critique asked for `LOCK_RENEW_INTERVAL_MS` and `LOCK_LEASE_MS` to come
  from measured write latency and clock sync on the ratatoskr node; that
  data is not in the report and was not requested from its operator. The
  values ship as documented defaults with the three-missed-writes
  rationale, and the future-stamp bound in step 1 removes the skew failure
  the critique attached to the same objection. Making them configurable is
  deliberately not done here — nobody asked for a knob, and a default that
  proves wrong in the field is a cheaper change than an interface.
