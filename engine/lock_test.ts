import { assertEquals } from "@std/assert";
import {
  acquireLock,
  type LockInfo,
  readLockInfo,
  releaseLock,
} from "./lock.ts";

Deno.test("acquireLock — creates lock file with pid and run_id", async () => {
  const tmpDir = await Deno.makeTempDir();
  const lockPath = `${tmpDir}/.lock`;

  await acquireLock(lockPath, "run-001");

  const info = await readLockInfo(lockPath);
  assertEquals(info.run_id, "run-001");
  assertEquals(info.pid, Deno.pid);
  assertEquals(typeof info.started_at, "string");

  await releaseLock(lockPath);
  await Deno.remove(tmpDir, { recursive: true });
});

Deno.test("acquireLock — fails if another live process holds lock", async () => {
  const tmpDir = await Deno.makeTempDir();
  const lockPath = `${tmpDir}/.lock`;

  // Write a lock with current PID (simulates another running process)
  const fakeLock: LockInfo = {
    pid: Deno.pid,
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

Deno.test("acquireLock — reclaims stale lock (dead PID)", async () => {
  const tmpDir = await Deno.makeTempDir();
  const lockPath = `${tmpDir}/.lock`;

  // Write a lock with a PID that doesn't exist (99999999)
  const staleLock: LockInfo = {
    pid: 99999999,
    run_id: "run-stale",
    started_at: new Date().toISOString(),
  };
  await Deno.writeTextFile(lockPath, JSON.stringify(staleLock));

  // Should succeed — stale lock is reclaimed
  await acquireLock(lockPath, "run-fresh");

  const info = await readLockInfo(lockPath);
  assertEquals(info.run_id, "run-fresh");
  assertEquals(info.pid, Deno.pid);

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
  await releaseLock(lockPath);

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
