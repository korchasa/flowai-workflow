import { assertEquals, assertRejects } from "@std/assert";
import {
  acquireLock,
  defaultLockPath,
  isRunLive,
  liveLockHolder,
  type LockInfo,
  readLockInfo,
} from "./lock.ts";

/** Write a lock file by hand, without ever holding the kernel lock — the
 * shape a killed holder leaves behind. */
async function writeDebris(
  lockPath: string,
  info: Partial<LockInfo>,
): Promise<void> {
  const full: LockInfo = {
    pid: 1,
    hostname: "some-other-host",
    run_id: "run-debris",
    started_at: new Date().toISOString(),
    ...info,
  };
  await Deno.writeTextFile(lockPath, JSON.stringify(full, null, 2) + "\n");
}

Deno.test("FR-E54 acquireLock — publishes pid, hostname, run_id", async () => {
  const dir = await Deno.makeTempDir();
  const lockPath = `${dir}/.lock`;

  const held = await acquireLock(lockPath, "run-001");
  try {
    const info = await readLockInfo(lockPath);
    assertEquals(info.run_id, "run-001");
    assertEquals(info.pid, Deno.pid);
    assertEquals(info.hostname, Deno.hostname());
    assertEquals(typeof info.started_at, "string");
    assertEquals(held.info.run_id, "run-001");
  } finally {
    await held.release();
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("FR-E54 acquireLock — refuses while the lock is held", async () => {
  const dir = await Deno.makeTempDir();
  const lockPath = `${dir}/.lock`;

  const held = await acquireLock(lockPath, "run-first");
  try {
    const err = await assertRejects(
      () => acquireLock(lockPath, "run-second"),
      Error,
    );
    assertEquals(err.message.includes("run-first"), true);
    assertEquals(err.message.includes("already running"), true);
  } finally {
    await held.release();
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("FR-E54 acquireLock — a released lock is free for the next run", async () => {
  const dir = await Deno.makeTempDir();
  const lockPath = `${dir}/.lock`;

  await (await acquireLock(lockPath, "run-first")).release();
  const second = await acquireLock(lockPath, "run-second");
  try {
    assertEquals((await readLockInfo(lockPath)).run_id, "run-second");
  } finally {
    await second.release();
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("FR-E102 acquireLock — debris naming a live local PID does not block", async () => {
  // The production deadlock: the lock file outlived its pod, and PID 12 in
  // every later pod belonged to a live, unrelated process. Nothing holds the
  // kernel lock, so the file must not stand in the way whatever it names.
  const dir = await Deno.makeTempDir();
  const lockPath = `${dir}/.lock`;
  await writeDebris(lockPath, { pid: Deno.pid, run_id: "run-dead-pod" });

  const held = await acquireLock(lockPath, "run-after-debris");
  try {
    assertEquals((await readLockInfo(lockPath)).run_id, "run-after-debris");
  } finally {
    await held.release();
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("FR-E102 acquireLock — debris from this host does not block either", async () => {
  const dir = await Deno.makeTempDir();
  const lockPath = `${dir}/.lock`;
  await writeDebris(lockPath, {
    pid: Deno.pid,
    hostname: Deno.hostname(),
    run_id: "run-crashed",
  });

  const held = await acquireLock(lockPath, "run-after-crash");
  try {
    assertEquals((await readLockInfo(lockPath)).run_id, "run-after-crash");
  } finally {
    await held.release();
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("FR-E102 acquireLock — unreadable debris does not block", async () => {
  const dir = await Deno.makeTempDir();
  const lockPath = `${dir}/.lock`;
  await Deno.writeTextFile(lockPath, "{ this is not json");

  const held = await acquireLock(lockPath, "run-after-corrupt");
  try {
    assertEquals((await readLockInfo(lockPath)).run_id, "run-after-corrupt");
  } finally {
    await held.release();
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("FR-E102 release — keeps the file as the record of the last run", async () => {
  const dir = await Deno.makeTempDir();
  const lockPath = `${dir}/.lock`;

  const held = await acquireLock(lockPath, "run-001");
  await held.release();

  // The file is the holder's record, not the lock itself: deleting it would
  // let a second run lock a different inode and believe it owns the folder.
  assertEquals((await readLockInfo(lockPath)).run_id, "run-001");
  await Deno.remove(dir, { recursive: true });
});

Deno.test("FR-E102 release — is idempotent", async () => {
  const dir = await Deno.makeTempDir();
  const lockPath = `${dir}/.lock`;

  const held = await acquireLock(lockPath, "run-001");
  await held.release();
  assertEquals(await held.release(), undefined);

  await Deno.remove(dir, { recursive: true });
});

Deno.test("FR-E102 liveLockHolder — null when nothing holds the folder", async () => {
  const wf = await Deno.makeTempDir();
  await Deno.mkdir(`${wf}/runs`, { recursive: true });

  assertEquals(await liveLockHolder(wf), null, "no lock file at all");

  await writeDebris(defaultLockPath(wf), { pid: Deno.pid });
  assertEquals(await liveLockHolder(wf), null, "debris is not a holder");

  await Deno.remove(wf, { recursive: true });
});

Deno.test("FR-E102 liveLockHolder — names the holder while the lock is held", async () => {
  const wf = await Deno.makeTempDir();
  await Deno.mkdir(`${wf}/runs`, { recursive: true });

  const held = await acquireLock(defaultLockPath(wf), "run-live");
  try {
    const holder = await liveLockHolder(wf);
    assertEquals(holder?.run_id, "run-live");
    assertEquals(holder?.pid, Deno.pid);
  } finally {
    await held.release();
    await Deno.remove(wf, { recursive: true });
  }
});

Deno.test("FR-E75 isRunLive — true only for the run that holds the lock", async () => {
  const wf = await Deno.makeTempDir();
  await Deno.mkdir(`${wf}/runs`, { recursive: true });

  const held = await acquireLock(defaultLockPath(wf), "run-live");
  try {
    assertEquals(await isRunLive(wf, "run-live"), true);
    assertEquals(await isRunLive(wf, "run-other"), false);
  } finally {
    await held.release();
  }
  assertEquals(await isRunLive(wf, "run-live"), false, "released");

  await Deno.remove(wf, { recursive: true });
});

Deno.test("FR-E54 readLockInfo — valid JSON of the wrong shape is a SyntaxError", async () => {
  const dir = await Deno.makeTempDir();
  const lockPath = `${dir}/.lock`;
  await Deno.writeTextFile(lockPath, JSON.stringify({ run_id: "x" }));

  await assertRejects(() => readLockInfo(lockPath), SyntaxError);

  await Deno.remove(dir, { recursive: true });
});

Deno.test("FR-E102 the kernel releases the lock when the holder is killed", async () => {
  // The whole premise in one test: a holder that never gets to clean up (OOM
  // kill, node crash) must not leave the folder locked.
  const wf = await Deno.makeTempDir();
  await Deno.mkdir(`${wf}/runs`, { recursive: true });
  const lockPath = defaultLockPath(wf);
  const mod = import.meta.resolve("./lock.ts");

  const child = new Deno.Command(Deno.execPath(), {
    args: [
      "eval",
      "--no-lock",
      "-A",
      `const { acquireLock } = await import(${JSON.stringify(mod)});
       await acquireLock(${JSON.stringify(lockPath)}, "run-child");
       await new Promise((r) => setTimeout(r, 60_000));`,
    ],
    stdout: "null",
    stderr: "null",
  }).spawn();

  try {
    let holder: LockInfo | null = null;
    for (let i = 0; i < 100 && holder === null; i++) {
      await new Promise((r) => setTimeout(r, 100));
      holder = await liveLockHolder(wf);
    }
    assertEquals(holder?.run_id, "run-child", "child took the lock");

    await assertRejects(() => acquireLock(lockPath, "run-parent"), Error);

    child.kill("SIGKILL");
    await child.status;

    const held = await acquireLock(lockPath, "run-parent");
    assertEquals(held.info.run_id, "run-parent");
    await held.release();
  } finally {
    await Deno.remove(wf, { recursive: true });
  }
});
