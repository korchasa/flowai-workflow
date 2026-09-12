import { assert, assertEquals, assertRejects } from "@std/assert";
import { Engine } from "./engine.ts";
import type { LockInfo } from "../state/lock.ts";

/**
 * FR-E102 lock-lease wiring. The engine must keep proving that it holds the
 * workflow lock while a run is in flight, and must refuse to finish
 * successfully once another run has taken the folder over.
 *
 * Everything is observed through `command` nodes (FR-E88), so a whole
 * workflow runs with no agent. The node under test copies the live lock file
 * mid-run, which is the only way to see a stamp that later teardown removes.
 */
async function runIn(
  dir: string,
  yaml: string,
  runId: string,
): Promise<Awaited<ReturnType<Engine["run"]>>> {
  const origCwd = Deno.cwd();
  await Deno.writeTextFile(`${dir}/workflow.yaml`, yaml);
  try {
    Deno.chdir(dir);
    const engine = new Engine({
      config_path: "workflow.yaml",
      run_id: runId,
      verbosity: "quiet",
      args: {},
      env_overrides: {},
      lock_path: "test.lock",
      lock_renew_interval_ms: 40,
    });
    return await engine.run();
  } finally {
    Deno.chdir(origCwd);
  }
}

const HEADER = [
  "name: lock-lease",
  "version: '1'",
  "defaults:",
  "  worktree_disabled: true",
  "nodes:",
].join("\n");

Deno.test("FR-E102 Engine.run — renews the lock while the run is in flight", async () => {
  const dir = await Deno.makeTempDir();

  const state = await runIn(
    dir,
    [
      HEADER,
      "  slow:",
      "    type: command",
      "    label: Slow",
      "    command: sleep 1 && cp test.lock lock-mid.json",
    ].join("\n"),
    "run-renewed",
  );

  assertEquals(state.status, "completed");

  const mid = JSON.parse(
    await Deno.readTextFile(`${dir}/lock-mid.json`),
  ) as LockInfo;
  assertEquals(mid.run_id, "run-renewed");
  assert(mid.renewed_at !== undefined, "the live lock must carry a lease");
  assert(
    Date.parse(mid.renewed_at) > Date.parse(mid.started_at),
    "the lease must advance while the run is in flight",
  );

  // Teardown removes the lock the run owns.
  await assertRejects(
    () => Deno.stat(`${dir}/test.lock`),
    Deno.errors.NotFound,
  );

  await Deno.remove(dir, { recursive: true });
});

Deno.test("FR-E102 Engine.run — fails the run when another run takes the lock over", async () => {
  const dir = await Deno.makeTempDir();

  const stolen = JSON.stringify({
    pid: 424242,
    hostname: "other-host",
    run_id: "run-thief",
    started_at: new Date().toISOString(),
    renewed_at: new Date().toISOString(),
  });

  const err = await assertRejects(() =>
    runIn(
      dir,
      [
        HEADER,
        "  steal:",
        "    type: command",
        "    label: Steal",
        `    command: printf '%s' '${stolen}' > test.lock && sleep 1`,
      ].join("\n"),
      "run-victim",
    )
  );
  assert(
    (err as Error).message.includes("run-thief"),
    `error must name the run that took over, got: ${(err as Error).message}`,
  );

  // The new holder's lock survives: the losing run must not free the folder.
  const left = JSON.parse(
    await Deno.readTextFile(`${dir}/test.lock`),
  ) as LockInfo;
  assertEquals(left.run_id, "run-thief");

  await Deno.remove(dir, { recursive: true });
});
