/**
 * @module
 * Per-workflow run lock (FR-E54). Serializes concurrent runs against the
 * same workflow folder; distinct workflow folders run in parallel.
 * Lock file lives at `<workflowDir>/runs/.lock` and contains JSON with
 * PID, hostname, run_id, and timestamp.
 * Stale detection: always PID check. Hostname stored for diagnostics only.
 * Rationale: lock file lives on local FS, so if readable — PID is checkable.
 */

/** Lock file content structure. */
export interface LockInfo {
  pid: number;
  hostname: string;
  run_id: string;
  started_at: string;
  /** Last time the holder proved it was still running (FR-E102). Absent in
   * locks written by pre-FR-E102 binaries, which is why every consumer has
   * to tolerate `undefined` rather than assume the field. */
  renewed_at?: string;
}

/** How often a running holder refreshes {@link LockInfo.renewed_at}. */
export const LOCK_RENEW_INTERVAL_MS = 15_000;

/** How long a lease stays valid without a refresh (FR-E102).
 *
 * Three renewal intervals wide, so one failed write — an NFS hiccup, a
 * momentarily starved node — never costs a live run its lock. It also bounds
 * recovery: a holder that dies without releasing blocks the folder for at
 * most this long instead of forever. */
export const LOCK_LEASE_MS = 3 * LOCK_RENEW_INTERVAL_MS;

/** Default lock file path for the given workflow folder (FR-E54).
 * `workflowDir` is the directory containing `workflow.yaml`
 * (typically `.flowai-workflow/<name>` under the multi-workflow layout, or
 * `.` for a bare top-level config). */
export function defaultLockPath(workflowDir: string): string {
  return `${workflowDir}/runs/.lock`;
}

/** Check if a process with given PID is alive on this host.
 *
 * `PermissionDenied` (POSIX `EPERM`) means the process EXISTS but belongs to
 * another user — it must count as alive. Treating it as dead (the previous
 * behaviour of a blanket `catch`) let one user reclaim a lock still held by
 * another user's running engine. Only `NotFound` (`ESRCH`) proves the PID is
 * gone; anything else is surfaced as "alive" because we cannot prove
 * otherwise and reclaiming on a guess is the destructive option. */
function isProcessAlive(pid: number): boolean {
  try {
    Deno.kill(pid, "SIGCONT");
    return true;
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) return false;
    return true;
  }
}

/** Read lock info from lock file.
 *
 * Throws `Deno.errors.NotFound` when the file is absent and `SyntaxError`
 * when its contents are not a well-formed {@link LockInfo} — including
 * syntactically valid JSON of the wrong shape (`null`, an array, a record
 * missing `pid`). Callers rely on that single "corrupt" category to decide
 * between reclaiming debris and surfacing a genuine I/O failure, so shape
 * validation must not be left to the first property access. */
export async function readLockInfo(lockPath: string): Promise<LockInfo> {
  const text = await Deno.readTextFile(lockPath);
  const parsed = JSON.parse(text);
  if (
    !parsed || typeof parsed !== "object" || Array.isArray(parsed) ||
    typeof (parsed as LockInfo).pid !== "number" ||
    typeof (parsed as LockInfo).run_id !== "string"
  ) {
    throw new SyntaxError(
      `Malformed lock file at ${lockPath}: expected {pid, hostname, run_id, started_at}`,
    );
  }
  return parsed as LockInfo;
}

/** Report whether `stamp` is a lease that has not expired at `now`.
 *
 * A stamp further than one lease window into the FUTURE is rejected too. No
 * correctly-clocked holder can be that far ahead, and admitting it would let
 * a fast clock on a dead node hold the folder for the whole skew — the
 * original jam rebuilt out of different parts. Ordinary NTP drift of a few
 * seconds stays comfortably inside the window. */
function isLeaseFresh(stamp: string | undefined, now: number): boolean {
  if (stamp === undefined) return false;
  const written = Date.parse(stamp);
  if (Number.isNaN(written)) return false;
  const age = now - written;
  if (age < -LOCK_LEASE_MS) return false;
  return age < LOCK_LEASE_MS;
}

/** Report whether the holder named by `info` is still running (FR-E102).
 *
 * Two namespaces, two rules:
 *
 * - **Same host** (or a lock with no `hostname` at all, the shape older
 *   binaries wrote and {@link readLockInfo} still accepts). A dead PID
 *   answers dead immediately, so a local crash is detected without waiting
 *   out a lease. A live PID is then qualified by the stamp when there is
 *   one: after a reboot the hostname is unchanged and the PID may have been
 *   handed to an unrelated process, and only the dead lease reveals that.
 *   A lock with no stamp predates the lease, so the PID alone decides —
 *   exactly the pre-FR-E102 behaviour.
 * - **Foreign host.** The PID belongs to another namespace and carries no
 *   information here, so only the lease counts. A pre-lease lock falls back
 *   to `started_at`, which is what lets an upgraded binary clear a lock that
 *   an older one left jammed. */
export function isLockHolderAlive(
  info: LockInfo,
  now: number = Date.now(),
): boolean {
  const sameHost = info.hostname === undefined ||
    info.hostname === Deno.hostname();
  if (sameHost) {
    if (!isProcessAlive(info.pid)) return false;
    if (info.renewed_at === undefined) return true;
    return isLeaseFresh(info.renewed_at, now);
  }
  return isLeaseFresh(info.renewed_at ?? info.started_at, now);
}

/** True when both records name the same holder of the same run. */
function isSameHolder(a: LockInfo, b: LockInfo): boolean {
  return a.run_id === b.run_id && a.pid === b.pid && a.hostname === b.hostname;
}

/** Report whether `runId` is the run currently held alive by the workflow
 * lock (FR-E75). True iff the lock file exists, names this exact `runId`,
 * and its PID is a live process. Returns false (never throws) when the
 * lock is absent, corrupted, owned by a different run, or held by a dead
 * PID. Used by the unified command layer so `answer` can tell the operator
 * whether the live poll loop will pick up the inbox file or whether they
 * must resume the engine separately. */
export async function isRunLive(
  workflowDir: string,
  runId: string,
): Promise<boolean> {
  let info: LockInfo;
  try {
    info = await readLockInfo(defaultLockPath(workflowDir));
  } catch {
    // NotFound (no lock) or SyntaxError (corrupted lock) → not live.
    return false;
  }
  return info.run_id === runId && isLockHolderAlive(info);
}

/** Return the lock holder for `workflowDir` iff a live process holds it
 * (FR-E84). Unlike {@link isRunLive} it does NOT match a specific run_id —
 * it answers "is ANY run currently active for this workflow folder", the
 * pre-check {@link startRun} needs before launching a fresh background run.
 * Returns null (never throws) when the lock is absent, corrupted, or held
 * by a dead PID. */
export async function liveLockHolder(
  workflowDir: string,
): Promise<LockInfo | null> {
  let info: LockInfo;
  try {
    info = await readLockInfo(defaultLockPath(workflowDir));
  } catch {
    // NotFound (no lock) or SyntaxError (corrupted lock) → not active.
    return null;
  }
  return isLockHolderAlive(info) ? info : null;
}

/**
 * Acquire the workflow lock. Throws if another live process holds it.
 * Reclaims stale locks (dead PID) and corrupted lock files automatically.
 *
 * Creation is ATOMIC: the lock file is opened with `createNew: true`, so the
 * kernel — not this process — decides the winner when two engines race. The
 * previous read-then-write shape had a window between "no lock found" and
 * "lock written" in which both racers concluded the folder was free and both
 * proceeded, defeating FR-E54's serialization guarantee.
 *
 * On `AlreadyExists` the holder is inspected once: a live PID is a hard
 * failure; a dead PID or an unparseable file is removed and creation is
 * retried. A single retry is enough — a third party winning the re-created
 * slot is itself a live holder and surfaces as the normal "already running"
 * error.
 *
 * Returns the record it published. The caller needs it to renew the lease
 * and to release safely, and handing it back keeps the caller from re-reading
 * the file — a read that can fail, leaving the lock held with nothing yet
 * registered to release it.
 */
export async function acquireLock(
  lockPath: string,
  runId: string,
): Promise<LockInfo> {
  const startedAt = new Date().toISOString();
  const info: LockInfo = {
    pid: Deno.pid,
    hostname: Deno.hostname(),
    run_id: runId,
    started_at: startedAt,
    // Seed the lease at creation so a foreign observer never has to fall
    // back to `started_at` for a lock this binary wrote.
    renewed_at: startedAt,
  };
  const payload = JSON.stringify(info, null, 2) + "\n";

  // Ensure parent directory exists
  const dir = lockPath.substring(0, lockPath.lastIndexOf("/"));
  if (dir) {
    await Deno.mkdir(dir, { recursive: true });
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await createLockFile(lockPath, payload);
      return info;
    } catch (err) {
      if (!(err instanceof Deno.errors.AlreadyExists)) throw err;
    }

    // Someone holds the file. Decide whether it is a live run or debris.
    let existing: LockInfo | undefined;
    try {
      existing = await readLockInfo(lockPath);
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) {
        // Holder released between create and read — retry the create.
        continue;
      }
      if (!(err instanceof SyntaxError)) throw err;
      // Corrupted lock file — treated as debris below (existing stays undefined).
    }

    if (existing && isLockHolderAlive(existing)) {
      throw new Error(
        `Workflow is already running (run_id: ${existing.run_id}, pid: ${existing.pid}, host: ${existing.hostname}). ` +
          `Remove ${lockPath} manually if the process is stuck.`,
      );
    }

    // Stale (dead PID) or corrupted — drop it and retry once.
    await releaseLock(lockPath);
  }

  throw new Error(
    `Failed to acquire workflow lock at ${lockPath}: contended by another process`,
  );
}

/**
 * Publish the lock file exclusively. Throws `AlreadyExists` when taken.
 *
 * Staged through a sibling temp file plus `Deno.link`, NOT a plain
 * `Deno.open({createNew: true})`. `createNew` publishes an EMPTY file and
 * fills it a moment later, so a racer that loses the create can still read
 * the empty file, classify it as corrupt debris, delete it and acquire the
 * lock — both processes then believe they hold it. A hard link makes the
 * name appear only when the content behind it is already complete.
 */
async function createLockFile(
  lockPath: string,
  payload: string,
): Promise<void> {
  const tmpPath = `${lockPath}.${Deno.pid}.tmp`;
  await Deno.writeTextFile(tmpPath, payload);
  try {
    await Deno.link(tmpPath, lockPath);
  } finally {
    await Deno.remove(tmpPath).catch(() => {});
  }
}

/** Release workflow lock unconditionally. No-op if lock file doesn't exist.
 *
 * Used by {@link acquireLock} to drop debris it has just judged dead. A run
 * releasing its OWN lock must use {@link releaseLockIfOwned} instead — see
 * the note there for why the difference matters. */
export async function releaseLock(lockPath: string): Promise<void> {
  try {
    await Deno.remove(lockPath);
  } catch (err) {
    if (!(err instanceof Deno.errors.NotFound)) {
      throw err;
    }
  }
}

/** Release the lock only while `info` still names its holder (FR-E102).
 *
 * The lease makes it possible for a run to lose its lock while still alive:
 * its renewals stall past the window, another run reclaims the folder, and
 * the first run reaches its own `finally` believing it still owns the file.
 * An unconditional unlink there would delete the NEW holder's lock and hand
 * the folder to a third run — two engines in one worktree, which is the
 * failure the lock exists to prevent. */
export async function releaseLockIfOwned(
  lockPath: string,
  info: LockInfo,
): Promise<void> {
  let current: LockInfo;
  try {
    current = await readLockInfo(lockPath);
  } catch {
    // Absent or unreadable — nothing of ours to remove.
    return;
  }
  if (!isSameHolder(current, info)) return;
  await releaseLock(lockPath);
}

/** Handle returned by {@link startLockRenewal}. */
export interface LockRenewal {
  /** Stop renewing. Synchronous and idempotent. */
  stop(): void;
}

/** Options for {@link startLockRenewal}. */
export interface LockRenewalOptions {
  /** Renewal period. Defaults to {@link LOCK_RENEW_INTERVAL_MS}. */
  intervalMs?: number;
  /** Called once when the lock stops being ours — it vanished, or another
   * run reclaimed it. Renewal has already stopped by then. The caller is
   * expected to treat this as fatal: another run may now own the workflow
   * folder, so continuing to write into the shared worktree is exactly the
   * two-holders failure the lock prevents. */
  onLost?: (reason: string) => void;
}

/** Write `info` over `lockPath` atomically.
 *
 * Renewal overwrites; creation does not. `Deno.link`, which
 * {@link createLockFile} uses to publish a lock exactly once, fails with
 * `AlreadyExists` on an existing name, so renewal stages a sibling temp file
 * and `Deno.rename`s it into place instead. Both are atomic; they differ
 * only in whether an existing name is allowed. */
async function writeLockAtomic(
  lockPath: string,
  info: LockInfo,
): Promise<void> {
  const tmpPath = `${lockPath}.${Deno.pid}.renew.tmp`;
  await Deno.writeTextFile(tmpPath, JSON.stringify(info, null, 2) + "\n");
  await Deno.rename(tmpPath, lockPath);
}

/** Keep proving that this process still holds `lockPath` (FR-E102).
 *
 * Refreshes `renewed_at` every `intervalMs` so observers in other PID
 * namespaces can tell a running holder from debris. The timer is unref'd and
 * never keeps a process alive.
 *
 * Transient read and write failures are swallowed and retried on the next
 * tick — the lease is three intervals wide precisely so one bad write is not
 * fatal. Losing ownership is the only condition that stops renewal. */
export function startLockRenewal(
  lockPath: string,
  info: LockInfo,
  opts: LockRenewalOptions = {},
): LockRenewal {
  const intervalMs = opts.intervalMs ?? LOCK_RENEW_INTERVAL_MS;
  let stopped = false;

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
  };

  const lose = (reason: string): void => {
    stop();
    opts.onLost?.(reason);
  };

  const tick = async (): Promise<void> => {
    if (stopped) return;

    let current: LockInfo;
    try {
      current = await readLockInfo(lockPath);
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) {
        lose(`lock file ${lockPath} disappeared`);
      }
      // Anything else (corrupt read mid-write, transient I/O) retries.
      return;
    }

    // `stop()` is synchronous and cannot recall a tick already past its
    // read, so the flag is re-checked after every await. Without this, a
    // tick in flight would rename the file back into place after the run
    // released it.
    if (stopped) return;

    if (!isSameHolder(current, info)) {
      lose(
        `lock is held by run ${current.run_id} (pid ${current.pid}, ` +
          `host ${current.hostname})`,
      );
      return;
    }

    const renewed: LockInfo = { ...info, renewed_at: new Date().toISOString() };
    try {
      await writeLockAtomic(lockPath, renewed);
    } catch {
      return; // Transient — the next tick retries inside the lease window.
    }
    if (stopped) {
      // Teardown landed while this write was in flight. Undo it, so the
      // guarantee "no tick recreates the lock after release" is exact
      // rather than merely probable.
      await releaseLockIfOwned(lockPath, renewed).catch(() => {});
    }
  };

  const timer = setInterval(() => void tick(), intervalMs);
  Deno.unrefTimer(timer);

  return { stop };
}
