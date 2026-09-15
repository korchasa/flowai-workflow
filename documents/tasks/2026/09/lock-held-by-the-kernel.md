---
date: "2026-09-15"
status: done
implements: [FR-E102]
tags: [engine, lock, reliability]
related_tasks:
  - 2026/05/per-workflow-run-lock.md
---

# Run lock held by the kernel

## Goal

A run that dies without cleaning up must leave the workflow folder usable.
Today it does not: the leftover lock file is judged by the PID recorded in
it, and that PID is not evidence. The folder stays jammed until a human
deletes the file.

## Overview

### Context

`acquireLock` wrote `{pid, hostname, run_id, started_at}` with
`Deno.open({createNew})` + `Deno.link`, and treated the file itself as the
lock. A contender read the record and asked `Deno.kill(pid, "SIGCONT")`
whether the holder was alive — reclaiming only on `ESRCH`. The module said
the hostname was "for diagnostics only", justified by "the lock file lives
on a local FS, so the PID is checkable".

That premise fails wherever the runs directory outlives the PID namespace
that wrote it: a Kubernetes hostPath, a docker volume, a reboot.

### Current state — the production failure

A hourly pipeline runs the engine in a Kubernetes CronJob; `runs/` is a
hostPath directory shared by every pod.

- 11.09 01:21 UTC the node died hard (power loss; no clean shutdown in the
  boot log). The run in flight left its lock behind.
- Every hourly run until 12.09 16:00 refused to start. 39 runs, ~40 hours.
- A human deleted the file and started a run by hand. At 17:09:35 the cgroup
  OOM killer took it (`Memory cgroup out of memory: Killed process … codex-main`)
  mid-node. New lock, same deadlock, another 67 hours.

The recorded PID was 12. Checked inside a later pod: PID 12 exists and is
`deno` — the engine's own process. The stale-reclaim branch could never fire.

### Constraints

- No heuristic may decide liveness. A threshold, a timeout or a clock is a
  place to be wrong, and the failure mode of being wrong in either direction
  is severe: a jammed folder, or two runs against one folder.
- The fix must hold for SIGKILL and for a node that stops executing code.

### Affected surface

- `src/state/lock.ts` — the lock itself.
- `src/engine/engine.ts` — acquire/release call sites.
- `src/mcp/mcp-server.ts` — `cancel_run` signals the recorded PID.
- `src/mcp/commands.ts` — `isRunLive`, `liveLockHolder` consumers (no
  signature change).
- `scripts/sdlc-status.ts` — a second, hand-written copy of the PID probe.

## Definition of Done

- Debris naming a live local PID does not block a run.
- A holder killed with SIGKILL leaves the folder free at once, proven across
  processes, not simulated.
- Releasing keeps the record on disk; nothing unlinks the lock file.
- `cancel_run` refuses to signal a holder on another host.
- One liveness predicate in the repo.
- `deno task check` green.

## Solution

### 1. The kernel holds the lock (`src/state/lock.ts`)

`acquireLock` opens the file, takes an advisory exclusive lock with
`FsFile.tryLock(true)`, and returns a `HeldLock` carrying the descriptor.
The descriptor is the lock: `release()` closes it, and so does any death of
the process. The record is published in place (truncate + write) while the
lock is held — never staged and renamed, which would swap the inode out from
under the lock.

`liveLockHolder` answers the one question by taking the lock and giving it
back: if it can be taken, nobody holds it, whatever the file says.

The file is never unlinked. The refusal message says so, because the old one
told operators to delete it.

### 2. Consumers

- `engine.ts` holds `HeldLock` across the run and releases it in `finally`
  and from the shutdown handler.
- `cancel_run` uses `liveLockHolder` and refuses when the holder's hostname
  is not this host — a PID from another namespace names an unrelated local
  process.
- `sdlc-status.ts` drops its own `pidAlive` and imports the predicate.

### 3. Verification

`deno task check`, plus the cross-process test: a child takes the lock, the
parent is refused, the child is SIGKILLed, the parent acquires immediately.

Measured on the affected host before writing any code:

- a lock taken on the node blocks a process inside a pod on the same
  hostPath file — the container boundary does not hide it;
- after SIGKILL the next contender acquires at once;
- a spawned child does not inherit the descriptor (CLOEXEC), so a surviving
  subprocess cannot keep a dead engine's lock alive.

## Follow-ups

- Advisory locks are not dependable over NFS. A network-filesystem
  deployment needs a different mechanism (a lease), and this task
  deliberately does not add one.
- Across the upgrade, a run started by a pre-FR-E102 binary holds the folder
  by file existence alone, which a new binary does not observe.
