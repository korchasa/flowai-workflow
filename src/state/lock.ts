/**
 * @module
 * Per-workflow run lock (FR-E54). Serializes concurrent runs against the
 * same workflow folder; distinct workflow folders run in parallel.
 *
 * The lock is held by the KERNEL, on an open file descriptor, not by the
 * presence of `<workflowDir>/runs/.lock` (FR-E102). The file carries a JSON
 * record of the holder — pid, hostname, run_id, started_at — but that record
 * decides nothing: it is what an operator reads, not what the engine trusts.
 *
 * Rationale: a lock that is a file must be released by the process that
 * wrote it, and a process killed by SIGKILL — an OOM kill, a node crash —
 * never gets to. Something else then has to judge whether the recorded
 * holder is still alive, and the obvious proxy, its PID, is not one. A PID
 * is meaningful only inside the namespace that issued it, and the runs
 * directory routinely outlives that namespace: a Kubernetes hostPath, a
 * docker volume, a reboot. In the incident that produced this module the
 * recorded PID was 12, and PID 12 in every later pod was the engine's own
 * `deno` process — live, unrelated, and enough to make the folder look busy
 * forever. 39 hourly runs died on it before a human deleted the file.
 *
 * An advisory kernel lock has no such proxy. The kernel drops it when the
 * holder's last descriptor closes, which happens on every exit path there
 * is, including the ones that run no code. There is nothing to time out and
 * nothing to reclaim.
 *
 * Two consequences worth knowing:
 * - The file is never unlinked. Deleting it while a run holds the lock lets
 *   the next run create a fresh inode and lock that instead, and both
 *   processes then believe they own the folder.
 * - Advisory locks are dependable on a local filesystem. Over NFS or another
 *   network filesystem they are not, and this module offers no substitute
 *   there.
 */

/** Lock file content: the holder's record, kept for humans and for
 * `cancel_run`. Never an input to the liveness decision. */
export interface LockInfo {
  pid: number;
  hostname: string;
  run_id: string;
  started_at: string;
}

/** Default lock file path for the given workflow folder (FR-E54).
 * `workflowDir` is the directory containing `workflow.yaml`
 * (typically `.flowai-workflow/<name>` under the multi-workflow layout, or
 * `.` for a bare top-level config). */
export function defaultLockPath(workflowDir: string): string {
  return `${workflowDir}/runs/.lock`;
}

/** A lock this process holds. Releasing closes the descriptor, which is what
 * drops the kernel lock; the file stays behind as the holder's record. */
export class HeldLock {
  #file: Deno.FsFile | null;

  constructor(file: Deno.FsFile, readonly info: LockInfo) {
    this.#file = file;
  }

  /** Release the lock. Idempotent — the engine releases both from its
   * `finally` and from a shutdown handler. */
  release(): Promise<void> {
    const file = this.#file;
    this.#file = null;
    if (file) file.close();
    return Promise.resolve();
  }
}

/** Read lock info from lock file.
 *
 * Throws `Deno.errors.NotFound` when the file is absent and `SyntaxError`
 * when its contents are not a well-formed {@link LockInfo} — including
 * syntactically valid JSON of the wrong shape (`null`, an array, a record
 * missing `pid`). Shape validation must not be left to the first property
 * access: callers distinguish "unreadable record" from a genuine I/O
 * failure. */
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

/**
 * Acquire the workflow lock. Throws when another process holds it.
 *
 * The descriptor returned inside {@link HeldLock} is the lock: keep it open
 * for the whole run and release it when the run ends. A file left behind by
 * a killed holder is not a lock and never blocks — whatever it names, and
 * however alive that PID looks on this host.
 */
export async function acquireLock(
  lockPath: string,
  runId: string,
): Promise<HeldLock> {
  const dir = lockPath.substring(0, lockPath.lastIndexOf("/"));
  if (dir) await Deno.mkdir(dir, { recursive: true });

  const file = await Deno.open(lockPath, {
    read: true,
    write: true,
    create: true,
  });
  try {
    if (!await takeWithRetries(file)) {
      throw new Error(describeHolder(lockPath, await recordOf(lockPath)));
    }
    const info: LockInfo = {
      pid: Deno.pid,
      hostname: Deno.hostname(),
      run_id: runId,
      started_at: new Date().toISOString(),
    };
    await publish(file, info);
    return new HeldLock(file, info);
  } catch (err) {
    // Closing drops the lock too, on every path out of here.
    file.close();
    throw err;
  }
}

/** Return the holder's record iff a process currently holds the lock on
 * `workflowDir` (FR-E84) — the pre-check callers need before launching a
 * run. Returns null when the folder is free: no lock file, or a file no
 * process holds. Throws only when the lock is held and its record cannot be
 * read, which is the sub-millisecond window between a holder taking the lock
 * and writing its record. */
export async function liveLockHolder(
  workflowDir: string,
): Promise<LockInfo | null> {
  const lockPath = defaultLockPath(workflowDir);
  let file: Deno.FsFile;
  try {
    // Read-only: the probe never writes, and the lock file often belongs to
    // another user — the engine in a container writes it as root, and an
    // operator reading status is not root.
    file = await Deno.open(lockPath, { read: true });
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) return null;
    throw err;
  }
  try {
    // A SHARED lock, not an exclusive one. It still conflicts with the
    // holder's exclusive lock, which is the question being asked, but two
    // probes no longer conflict with each other — with exclusive probes the
    // loser of that race reads the previous run's record and reports a
    // holder that does not exist.
    if (await file.tryLock(false)) {
      await file.unlock();
      return null;
    }
  } finally {
    file.close();
  }
  return await readLockInfo(lockPath);
}

/** Report whether `runId` is the run currently holding the workflow lock
 * (FR-E75). Returns false (never throws) when the folder is free, held by a
 * different run, or unreadable. Used by the unified command layer so
 * `answer` can tell the operator whether the live poll loop will pick up the
 * inbox file or whether they must resume the engine separately. */
export async function isRunLive(
  workflowDir: string,
  runId: string,
): Promise<boolean> {
  try {
    const holder = await liveLockHolder(workflowDir);
    return holder?.run_id === runId;
  } catch {
    return false;
  }
}

/** How many times acquisition asks for the lock before calling the folder
 * busy, and how long it waits between asks. A run holds the lock for minutes;
 * a probe holds it for microseconds. Retrying separates the two without
 * guessing anything about the holder — losing the lock race once says
 * nothing, and losing it three times over 100 ms says a run owns the folder.
 * The floor matters: a single attempt let one concurrent status probe fail a
 * whole run with "already running", the error this module exists to stop. */
const ACQUIRE_ATTEMPTS = 3;
const ACQUIRE_RETRY_MS = 50;

async function takeWithRetries(file: Deno.FsFile): Promise<boolean> {
  for (let attempt = 0; attempt < ACQUIRE_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, ACQUIRE_RETRY_MS));
    }
    if (await file.tryLock(true)) return true;
  }
  return false;
}

/** The holder's record, or null when it cannot be read. Used for the error
 * message only, where an unreadable record must not mask the refusal. */
async function recordOf(lockPath: string): Promise<LockInfo | null> {
  try {
    return await readLockInfo(lockPath);
  } catch {
    return null;
  }
}

function describeHolder(lockPath: string, info: LockInfo | null): string {
  const who = info
    ? `run_id: ${info.run_id}, pid: ${info.pid}, host: ${info.hostname}, ` +
      `started: ${info.started_at}`
    : "its record is unreadable";
  return `Workflow is already running (${who}). The lock is held by a live ` +
    `process, not by ${lockPath}; deleting that file does not free the ` +
    `folder, it only lets a second run believe it owns one.`;
}

/** Overwrite the record in place. The descriptor stays open and locked, so
 * the record cannot be staged through a rename: that would swap the inode
 * out from under the lock. */
async function publish(file: Deno.FsFile, info: LockInfo): Promise<void> {
  const payload = new TextEncoder().encode(
    JSON.stringify(info, null, 2) + "\n",
  );
  await file.truncate(0);
  await file.seek(0, Deno.SeekMode.Start);
  for (let written = 0; written < payload.length;) {
    written += await file.write(payload.subarray(written));
  }
}
