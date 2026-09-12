import { assert, assertEquals, assertRejects } from "@std/assert";
import {
  acquireLock,
  defaultLockPath,
  isRunLive,
  liveLockHolder,
  type LockInfo,
  readLockInfo,
  releaseLock,
  releaseLockIfOwned,
  startLockRenewal,
} from "./lock.ts";

/** Hostname from the reported ratatoskr pod — any value that cannot equal
 * `Deno.hostname()` works; the real one keeps the regression legible. */
const FOREIGN_HOST = "ratatoskr-feed-29818140-qqf75";

/** ISO stamp `ms` milliseconds in the past. */
function ago(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

/** Long enough to be outside any plausible lease window. */
const LONG_AGO = 10 * 60_000;

Deno.test("FR-E54 readLockInfo — valid JSON of the wrong shape is a SyntaxError", async () => {
  const tmpDir = await Deno.makeTempDir();
  const lockPath = `${tmpDir}/.lock`;

  // `null`, arrays and pid-less records parse as JSON but are not locks.
  // Classifying them up front keeps "corrupt" a single, handled category
  // instead of a TypeError thrown from the first property access.
  for (const body of ["null", "[]", '{"run_id":"x"}']) {
    await Deno.writeTextFile(lockPath, body);
    await assertRejects(() => readLockInfo(lockPath), SyntaxError);
  }

  await Deno.remove(tmpDir, { recursive: true });
});

Deno.test("FR-E54 acquireLock — reclaims a structurally corrupt lock file", async () => {
  const tmpDir = await Deno.makeTempDir();
  const lockPath = `${tmpDir}/.lock`;

  // Debris from a crashed writer names no PID, so it cannot be proven live.
  // Reclaiming it is the documented behaviour for corrupted locks.
  await Deno.writeTextFile(lockPath, "null");

  await acquireLock(lockPath, "run-after-corrupt");

  assertEquals((await readLockInfo(lockPath)).run_id, "run-after-corrupt");

  await releaseLock(lockPath);
  await Deno.remove(tmpDir, { recursive: true });
});

Deno.test("FR-E54 acquireLock — genuine I/O errors propagate (fail fast)", async () => {
  const tmpDir = await Deno.makeTempDir();
  // A directory at the lock path: `Deno.open(createNew)` reports
  // AlreadyExists, then reading it fails with an I/O error that is neither
  // NotFound nor SyntaxError. It must surface rather than be reclaimed —
  // reclaiming on an unexplained error is the destructive option.
  const lockPath = `${tmpDir}/.lock`;
  await Deno.mkdir(lockPath);

  await assertRejects(() => acquireLock(lockPath, "run-io-error"));

  await Deno.remove(tmpDir, { recursive: true });
});

Deno.test("FR-E54 acquireLock — creation is atomic against a concurrent racer", async () => {
  const tmpDir = await Deno.makeTempDir();
  const lockPath = `${tmpDir}/.lock`;

  // Both callers observe an empty folder before either writes. With the old
  // read-then-write shape both concluded the workflow was free and both
  // "acquired" it; exclusive creation makes the kernel pick one winner.
  const results = await Promise.allSettled([
    acquireLock(lockPath, "run-a"),
    acquireLock(lockPath, "run-b"),
  ]);
  const granted = results.filter((r) => r.status === "fulfilled");
  assertEquals(granted.length, 1);

  await releaseLock(lockPath);
  await Deno.remove(tmpDir, { recursive: true });
});

Deno.test("acquireLock — creates lock file with pid, hostname, and run_id", async () => {
  const tmpDir = await Deno.makeTempDir();
  const lockPath = `${tmpDir}/.lock`;

  await acquireLock(lockPath, "run-001");

  const info = await readLockInfo(lockPath);
  assertEquals(info.run_id, "run-001");
  assertEquals(info.pid, Deno.pid);
  assertEquals(info.hostname, Deno.hostname());
  assertEquals(typeof info.started_at, "string");

  await releaseLock(lockPath);
  await Deno.remove(tmpDir, { recursive: true });
});

Deno.test("acquireLock — fails if same-host live process holds lock", async () => {
  const tmpDir = await Deno.makeTempDir();
  const lockPath = `${tmpDir}/.lock`;

  // Write a lock with current PID and hostname (simulates another running process)
  const fakeLock: LockInfo = {
    pid: Deno.pid,
    hostname: Deno.hostname(),
    run_id: "run-existing",
    started_at: new Date().toISOString(),
  };
  await Deno.writeTextFile(lockPath, JSON.stringify(fakeLock));

  let caught = false;
  try {
    await acquireLock(lockPath, "run-new");
  } catch (err) {
    caught = true;
    assertEquals((err as Error).message.includes("run-existing"), true);
    assertEquals((err as Error).message.includes("already running"), true);
  }
  assertEquals(caught, true);

  await Deno.remove(tmpDir, { recursive: true });
});

Deno.test("FR-E102 acquireLock — reclaims an expired foreign-host lock", async () => {
  const tmpDir = await Deno.makeTempDir();
  const lockPath = `${tmpDir}/.lock`;

  // A lock from another host. Its PID belongs to another namespace, so it
  // carries no information here; the expired lease is what proves the
  // holder is gone.
  const remoteLock: LockInfo = {
    pid: 99999999,
    hostname: "docker-container-abc123",
    run_id: "run-remote",
    started_at: ago(LONG_AGO),
    renewed_at: ago(LONG_AGO),
  };
  await Deno.writeTextFile(lockPath, JSON.stringify(remoteLock));

  await acquireLock(lockPath, "run-local");

  const info = await readLockInfo(lockPath);
  assertEquals(info.run_id, "run-local");
  assertEquals(info.pid, Deno.pid);

  await releaseLock(lockPath);
  await Deno.remove(tmpDir, { recursive: true });
});

Deno.test("acquireLock — reclaims stale lock (dead PID, same host)", async () => {
  const tmpDir = await Deno.makeTempDir();
  const lockPath = `${tmpDir}/.lock`;

  // Lock with dead PID on same hostname — stale, should be reclaimed
  const staleLock: LockInfo = {
    pid: 99999999,
    hostname: Deno.hostname(),
    run_id: "run-stale",
    started_at: new Date().toISOString(),
  };
  await Deno.writeTextFile(lockPath, JSON.stringify(staleLock));

  // Should succeed — stale lock is reclaimed
  await acquireLock(lockPath, "run-fresh");

  const info = await readLockInfo(lockPath);
  assertEquals(info.run_id, "run-fresh");
  assertEquals(info.pid, Deno.pid);
  assertEquals(info.hostname, Deno.hostname());

  await releaseLock(lockPath);
  await Deno.remove(tmpDir, { recursive: true });
});

Deno.test("acquireLock — reclaims lock without hostname field (backward compat)", async () => {
  const tmpDir = await Deno.makeTempDir();
  const lockPath = `${tmpDir}/.lock`;

  // Old lock format without hostname — treat as same host, check PID
  const oldLock = {
    pid: 99999999,
    run_id: "run-old",
    started_at: new Date().toISOString(),
  };
  await Deno.writeTextFile(lockPath, JSON.stringify(oldLock));

  // PID is dead → should reclaim
  await acquireLock(lockPath, "run-new");

  const info = await readLockInfo(lockPath);
  assertEquals(info.run_id, "run-new");

  await releaseLock(lockPath);
  await Deno.remove(tmpDir, { recursive: true });
});

Deno.test("releaseLock — removes lock file", async () => {
  const tmpDir = await Deno.makeTempDir();
  const lockPath = `${tmpDir}/.lock`;

  await acquireLock(lockPath, "run-001");
  await releaseLock(lockPath);

  let exists = true;
  try {
    await Deno.stat(lockPath);
  } catch {
    exists = false;
  }
  assertEquals(exists, false);

  await Deno.remove(tmpDir, { recursive: true });
});

Deno.test("releaseLock — no error if lock file already removed", async () => {
  const tmpDir = await Deno.makeTempDir();
  const lockPath = `${tmpDir}/.lock`;

  // Should not throw even if file doesn't exist
  assertEquals(await releaseLock(lockPath), undefined);

  let exists = true;
  try {
    await Deno.stat(lockPath);
  } catch {
    exists = false;
  }
  assertEquals(exists, false);

  await Deno.remove(tmpDir, { recursive: true });
});

Deno.test("readLockInfo — throws if lock file missing", async () => {
  let caught = false;
  try {
    await readLockInfo("/nonexistent/.lock");
  } catch {
    caught = true;
  }
  assertEquals(caught, true);
});

// FR-E75: liveness probe for the unified command layer — tells `answer`
// whether the engine process is alive (and resuming) or whether the caller
// must resume separately.
Deno.test("FR-E75 isRunLive — true when lock holds matching run_id and live PID", async () => {
  const wf = await Deno.makeTempDir();
  const held: LockInfo = {
    pid: Deno.pid, // current process is alive by definition
    hostname: Deno.hostname(),
    run_id: "run-live",
    started_at: new Date().toISOString(),
  };
  await Deno.mkdir(`${wf}/runs`, { recursive: true });
  await Deno.writeTextFile(defaultLockPath(wf), JSON.stringify(held));

  assertEquals(await isRunLive(wf, "run-live"), true);

  await Deno.remove(wf, { recursive: true });
});

Deno.test("FR-E75 isRunLive — false when lock PID is dead", async () => {
  const wf = await Deno.makeTempDir();
  const dead: LockInfo = {
    pid: 99999999, // not a live PID
    hostname: Deno.hostname(),
    run_id: "run-dead",
    started_at: new Date().toISOString(),
  };
  await Deno.mkdir(`${wf}/runs`, { recursive: true });
  await Deno.writeTextFile(defaultLockPath(wf), JSON.stringify(dead));

  assertEquals(await isRunLive(wf, "run-dead"), false);

  await Deno.remove(wf, { recursive: true });
});

Deno.test("FR-E75 isRunLive — false when lock run_id does not match", async () => {
  const wf = await Deno.makeTempDir();
  const other: LockInfo = {
    pid: Deno.pid, // alive, but belongs to a different run
    hostname: Deno.hostname(),
    run_id: "run-other",
    started_at: new Date().toISOString(),
  };
  await Deno.mkdir(`${wf}/runs`, { recursive: true });
  await Deno.writeTextFile(defaultLockPath(wf), JSON.stringify(other));

  assertEquals(await isRunLive(wf, "run-requested"), false);

  await Deno.remove(wf, { recursive: true });
});

Deno.test("FR-E75 isRunLive — false when no lock file exists", async () => {
  const wf = await Deno.makeTempDir();
  assertEquals(await isRunLive(wf, "run-x"), false);
  await Deno.remove(wf, { recursive: true });
});

// FR-E84: pre-check for `startRun` background launch — "is ANY run active
// for this workflow folder", independent of a specific run_id.
Deno.test("FR-E84 liveLockHolder — returns info when a live process holds the lock", async () => {
  const wf = await Deno.makeTempDir();
  const held: LockInfo = {
    pid: Deno.pid, // current process is alive by definition
    hostname: Deno.hostname(),
    run_id: "run-live",
    started_at: new Date().toISOString(),
  };
  await Deno.mkdir(`${wf}/runs`, { recursive: true });
  await Deno.writeTextFile(defaultLockPath(wf), JSON.stringify(held));

  const holder = await liveLockHolder(wf);
  assertEquals(holder?.run_id, "run-live");
  assertEquals(holder?.pid, Deno.pid);

  await Deno.remove(wf, { recursive: true });
});

Deno.test("FR-E84 liveLockHolder — null when lock PID is dead", async () => {
  const wf = await Deno.makeTempDir();
  const dead: LockInfo = {
    pid: 99999999,
    hostname: Deno.hostname(),
    run_id: "run-dead",
    started_at: new Date().toISOString(),
  };
  await Deno.mkdir(`${wf}/runs`, { recursive: true });
  await Deno.writeTextFile(defaultLockPath(wf), JSON.stringify(dead));

  assertEquals(await liveLockHolder(wf), null);

  await Deno.remove(wf, { recursive: true });
});

Deno.test("FR-E84 liveLockHolder — null when no lock file exists", async () => {
  const wf = await Deno.makeTempDir();
  assertEquals(await liveLockHolder(wf), null);
  await Deno.remove(wf, { recursive: true });
});

Deno.test("defaultLockPath — derives <workflowDir>/runs/.lock (FR-E54)", () => {
  assertEquals(
    defaultLockPath(".flowai-workflow/github-inbox"),
    ".flowai-workflow/github-inbox/runs/.lock",
  );
  assertEquals(
    defaultLockPath(".flowai-workflow/github-inbox-opencode"),
    ".flowai-workflow/github-inbox-opencode/runs/.lock",
  );
  assertEquals(defaultLockPath("."), "./runs/.lock");
});

Deno.test("acquireLock — distinct workflow dirs hold independent locks (FR-E54)", async () => {
  // Two sibling workflow folders under one repo simulate the multi-workflow
  // layout (`.flowai-workflow/<a>` and `.flowai-workflow/<b>`).
  const tmpRoot = await Deno.makeTempDir();
  const wfA = `${tmpRoot}/wf-a`;
  const wfB = `${tmpRoot}/wf-b`;
  const lockA = defaultLockPath(wfA);
  const lockB = defaultLockPath(wfB);

  // Both acquire concurrently — must succeed even though the current PID is
  // the holder of lockA when lockB is acquired.
  await acquireLock(lockA, "run-a");
  await acquireLock(lockB, "run-b");

  const infoA = await readLockInfo(lockA);
  const infoB = await readLockInfo(lockB);
  assertEquals(infoA.run_id, "run-a");
  assertEquals(infoB.run_id, "run-b");
  assertEquals(infoA.pid, Deno.pid);
  assertEquals(infoB.pid, Deno.pid);

  await releaseLock(lockA);
  await releaseLock(lockB);
  await Deno.remove(tmpRoot, { recursive: true });
});

Deno.test("acquireLock — same workflow dir still serializes (FR-E54 carry-over of FR-E25)", async () => {
  // Per-workflow scope must NOT relax same-folder serialization: a live
  // PID holding `<workflowDir>/runs/.lock` still blocks a second acquire
  // against the same path.
  const tmpRoot = await Deno.makeTempDir();
  const wf = `${tmpRoot}/wf`;
  const lockPath = defaultLockPath(wf);

  // Simulate another live process holding the lock: write current PID
  // (alive by definition) and current hostname.
  await Deno.mkdir(`${wf}/runs`, { recursive: true });
  const held: LockInfo = {
    pid: Deno.pid,
    hostname: Deno.hostname(),
    run_id: "run-first",
    started_at: new Date().toISOString(),
  };
  await Deno.writeTextFile(lockPath, JSON.stringify(held));

  let caught = false;
  try {
    await acquireLock(lockPath, "run-second");
  } catch (err) {
    caught = true;
    assertEquals((err as Error).message.includes("run-first"), true);
  }
  assertEquals(caught, true);

  await Deno.remove(tmpRoot, { recursive: true });
});

// ---------------------------------------------------------------------------
// FR-E102: liveness across PID namespaces.
//
// The runs directory can outlive the process namespace that wrote the lock —
// a Kubernetes hostPath, a docker volume, a reboot with the lock on a shared
// disk. A PID from a foreign namespace names an unrelated local process, so
// liveness has to be proven by the holder rather than inferred from a number.
// ---------------------------------------------------------------------------

Deno.test("FR-E102 acquireLock — returns the record it wrote", async () => {
  const tmpDir = await Deno.makeTempDir();
  const lockPath = `${tmpDir}/.lock`;

  // The caller needs this record to renew and to release safely. Re-reading
  // the file instead leaves a window between acquiring the lock and
  // registering anything that would release it.
  const held = await acquireLock(lockPath, "run-returned");
  assertEquals(held, await readLockInfo(lockPath));

  await releaseLock(lockPath);
  await Deno.remove(tmpDir, { recursive: true });
});

Deno.test("FR-E102 acquireLock — a foreign-host lock is not kept alive by a live local PID", async () => {
  const tmpDir = await Deno.makeTempDir();
  const lockPath = `${tmpDir}/.lock`;

  // `Deno.pid` is alive in THIS namespace and says nothing about the holder's.
  await Deno.writeTextFile(
    lockPath,
    JSON.stringify({
      pid: Deno.pid,
      hostname: FOREIGN_HOST,
      run_id: "run-foreign",
      started_at: ago(LONG_AGO),
      renewed_at: ago(LONG_AGO),
    }),
  );

  await acquireLock(lockPath, "run-local");
  assertEquals((await readLockInfo(lockPath)).run_id, "run-local");

  await releaseLock(lockPath);
  await Deno.remove(tmpDir, { recursive: true });
});

Deno.test("FR-E102 acquireLock — reclaims the ratatoskr k8s lock (foreign host, locally-live PID)", async () => {
  const tmpDir = await Deno.makeTempDir();
  const lockPath = `${tmpDir}/.lock`;

  // The exact shape left behind on 2026-09-11: written by a pre-lease binary,
  // so no `renewed_at` at all, naming a pod that no longer exists. It jammed
  // 39 consecutive hourly runs until a human deleted the file.
  await Deno.writeTextFile(
    lockPath,
    JSON.stringify({
      pid: Deno.pid,
      hostname: FOREIGN_HOST,
      run_id: "20260911T010001",
      started_at: ago(40 * 60 * 60_000),
    }),
  );

  await acquireLock(lockPath, "20260912T120000");
  assertEquals((await readLockInfo(lockPath)).run_id, "20260912T120000");

  await releaseLock(lockPath);
  await Deno.remove(tmpDir, { recursive: true });
});

Deno.test("FR-E102 acquireLock — a foreign-host holder that still renews is not reclaimed", async () => {
  const tmpDir = await Deno.makeTempDir();
  const lockPath = `${tmpDir}/.lock`;

  // Dead PID locally, but the holder is renewing from another host: a live
  // remote run sharing the directory over NFS. Reclaiming would put two
  // engines in one worktree.
  await Deno.writeTextFile(
    lockPath,
    JSON.stringify({
      pid: 99999999,
      hostname: FOREIGN_HOST,
      run_id: "run-remote-live",
      started_at: ago(LONG_AGO),
      renewed_at: new Date().toISOString(),
    }),
  );

  await assertRejects(
    () => acquireLock(lockPath, "run-local"),
    Error,
    "already running",
  );

  await Deno.remove(tmpDir, { recursive: true });
});

Deno.test("FR-E102 acquireLock — a same-host lock with a live PID but an expired lease is reclaimed", async () => {
  const tmpDir = await Deno.makeTempDir();
  const lockPath = `${tmpDir}/.lock`;

  // Reboot with the lock on a shared disk: the hostname is unchanged and the
  // PID has been handed to an unrelated process. Only the dead lease reveals
  // that the run is gone.
  await Deno.writeTextFile(
    lockPath,
    JSON.stringify({
      pid: Deno.pid,
      hostname: Deno.hostname(),
      run_id: "run-before-reboot",
      started_at: ago(LONG_AGO),
      renewed_at: ago(LONG_AGO),
    }),
  );

  await acquireLock(lockPath, "run-after-reboot");
  assertEquals((await readLockInfo(lockPath)).run_id, "run-after-reboot");

  await releaseLock(lockPath);
  await Deno.remove(tmpDir, { recursive: true });
});

Deno.test("FR-E102 lock liveness — a stamp beyond the lease window in the future is not alive", async () => {
  const tmpDir = await Deno.makeTempDir();
  const lockPath = `${tmpDir}/.lock`;

  // A fast clock on a dead node would otherwise hold the folder for the whole
  // skew — the reported jam rebuilt out of different parts.
  await Deno.writeTextFile(
    lockPath,
    JSON.stringify({
      pid: 99999999,
      hostname: FOREIGN_HOST,
      run_id: "run-skewed",
      started_at: ago(LONG_AGO),
      renewed_at: new Date(Date.now() + 60 * 60_000).toISOString(),
    }),
  );

  await acquireLock(lockPath, "run-local");
  assertEquals((await readLockInfo(lockPath)).run_id, "run-local");

  await releaseLock(lockPath);
  await Deno.remove(tmpDir, { recursive: true });
});

Deno.test("FR-E102 lock liveness — isRunLive, liveLockHolder and acquireLock agree on a foreign-host lock", async () => {
  const wf = await Deno.makeTempDir();
  await Deno.mkdir(`${wf}/runs`, { recursive: true });
  const lockPath = defaultLockPath(wf);

  // Expired foreign lease: all three answers must be "not held".
  await Deno.writeTextFile(
    lockPath,
    JSON.stringify({
      pid: Deno.pid,
      hostname: FOREIGN_HOST,
      run_id: "run-foreign",
      started_at: ago(LONG_AGO),
      renewed_at: ago(LONG_AGO),
    }),
  );
  assertEquals(await isRunLive(wf, "run-foreign"), false);
  assertEquals(await liveLockHolder(wf), null);
  await acquireLock(lockPath, "run-local");
  await releaseLock(lockPath);

  // Fresh foreign lease: all three answers must be "held".
  await Deno.writeTextFile(
    lockPath,
    JSON.stringify({
      pid: 99999999,
      hostname: FOREIGN_HOST,
      run_id: "run-foreign",
      started_at: ago(LONG_AGO),
      renewed_at: new Date().toISOString(),
    }),
  );
  assertEquals(await isRunLive(wf, "run-foreign"), true);
  assertEquals((await liveLockHolder(wf))?.run_id, "run-foreign");
  await assertRejects(() => acquireLock(lockPath, "run-local"), Error);

  await Deno.remove(wf, { recursive: true });
});

Deno.test("FR-E102 startLockRenewal — advances renewed_at while the holder runs", async () => {
  const tmpDir = await Deno.makeTempDir();
  const lockPath = `${tmpDir}/.lock`;

  await acquireLock(lockPath, "run-renewing");
  const info = await readLockInfo(lockPath);
  const before = info.renewed_at;
  assert(before !== undefined, "acquireLock must stamp renewed_at");

  const renewal = startLockRenewal(lockPath, info, { intervalMs: 20 });
  await new Promise((r) => setTimeout(r, 150));
  renewal.stop();

  const after = await readLockInfo(lockPath);
  assert(
    Date.parse(after.renewed_at!) > Date.parse(before),
    "renewed_at must advance while the holder runs",
  );
  assertEquals(after.run_id, "run-renewing");

  await releaseLock(lockPath);
  await Deno.remove(tmpDir, { recursive: true });
});

Deno.test("FR-E102 startLockRenewal — after stop() the stamp never advances again", async () => {
  const tmpDir = await Deno.makeTempDir();
  const lockPath = `${tmpDir}/.lock`;

  await acquireLock(lockPath, "run-stopping");
  const renewal = startLockRenewal(lockPath, await readLockInfo(lockPath), {
    intervalMs: 20,
  });
  await new Promise((r) => setTimeout(r, 60));
  renewal.stop();
  const frozen = (await readLockInfo(lockPath)).renewed_at;

  // An unref'd timer is excluded from the op sanitizer's accounting, so a
  // forgotten teardown cannot be caught by leak detection — assert the
  // observable effect instead.
  await new Promise((r) => setTimeout(r, 120));
  assertEquals((await readLockInfo(lockPath)).renewed_at, frozen);

  // A tick already in flight must not resurrect a released lock either.
  await releaseLock(lockPath);
  await new Promise((r) => setTimeout(r, 120));
  await assertRejects(() => readLockInfo(lockPath), Deno.errors.NotFound);

  await Deno.remove(tmpDir, { recursive: true });
});

Deno.test("FR-E102 startLockRenewal — reports loss of ownership to its owner", async () => {
  const tmpDir = await Deno.makeTempDir();
  const lockPath = `${tmpDir}/.lock`;

  await acquireLock(lockPath, "run-a");
  const mine = await readLockInfo(lockPath);

  let lost: string | undefined;
  const renewal = startLockRenewal(lockPath, mine, {
    intervalMs: 20,
    onLost: (reason) => {
      lost = reason;
    },
  });

  // Another run takes the folder over while we are still running.
  await Deno.writeTextFile(
    lockPath,
    JSON.stringify({
      pid: 424242,
      hostname: "other-host",
      run_id: "run-b",
      started_at: new Date().toISOString(),
      renewed_at: new Date().toISOString(),
    }),
  );

  await new Promise((r) => setTimeout(r, 150));
  renewal.stop();

  assert(lost !== undefined, "onLost must fire when the lock is taken over");
  assertEquals(
    (await readLockInfo(lockPath)).run_id,
    "run-b",
    "renewal must not overwrite the new holder",
  );

  await Deno.remove(tmpDir, { recursive: true });
});

Deno.test("FR-E102 releaseLockIfOwned — leaves a lock reclaimed by another run intact", async () => {
  const tmpDir = await Deno.makeTempDir();
  const lockPath = `${tmpDir}/.lock`;

  await acquireLock(lockPath, "run-a");
  const mine = await readLockInfo(lockPath);

  // Our lease expired and another run took the folder. Unlinking now would
  // free it for a third run while run-b is still working.
  await Deno.writeTextFile(
    lockPath,
    JSON.stringify({
      pid: 424242,
      hostname: "other-host",
      run_id: "run-b",
      started_at: new Date().toISOString(),
      renewed_at: new Date().toISOString(),
    }),
  );

  await releaseLockIfOwned(lockPath, mine);
  assertEquals((await readLockInfo(lockPath)).run_id, "run-b");

  // It still releases a lock we do own.
  await releaseLockIfOwned(lockPath, await readLockInfo(lockPath));
  await assertRejects(() => readLockInfo(lockPath), Deno.errors.NotFound);

  await Deno.remove(tmpDir, { recursive: true });
});
