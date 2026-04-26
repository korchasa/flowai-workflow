import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { join } from "@std/path";
import {
  extractCliFlags,
  getVersionString,
  listWorkflows,
  parseArgs,
  resolveWorkflowConfigPath,
  VERSION,
} from "./cli.ts";

Deno.test("parseArgs — --prompt sets args.prompt", async () => {
  const opts = await parseArgs(["--prompt", "Fix the login bug"]);
  assertEquals(opts.args.prompt, "Fix the login bug");
});

Deno.test("parseArgs — no flags leaves config_path empty for autodetection", async () => {
  const opts = await parseArgs([]);
  assertEquals(opts.args.prompt, undefined);
  assertEquals(opts.config_path, "");
});

Deno.test("parseArgs — --workflow sets config_path to <dir>/workflow.yaml", () => {
  const opts = parseArgs([
    "--workflow",
    ".flowai-workflow/github-inbox",
    "--prompt",
    "Refactor auth module",
    "-v",
  ]);
  assertEquals(
    opts.config_path,
    ".flowai-workflow/github-inbox/workflow.yaml",
  );
  assertEquals(opts.args.prompt, "Refactor auth module");
  assertEquals(opts.verbosity, "verbose");
});

Deno.test("parseArgs — trailing slash on --workflow argument is normalized", () => {
  const opts = parseArgs(["--workflow", ".flowai-workflow/github-inbox/"]);
  assertEquals(
    opts.config_path,
    ".flowai-workflow/github-inbox/workflow.yaml",
  );
});

Deno.test("parseArgs — --config flag rejected with --workflow hint (FR-E53)", () => {
  assertThrows(
    () => parseArgs(["--config", "x.yaml"]),
    Error,
    "Use --workflow",
  );
});

Deno.test("parseArgs — --resume sets resume and run_id", async () => {
  const opts = await parseArgs(["--resume", "20260308T143022"]);
  assertEquals(opts.resume, true);
  assertEquals(opts.run_id, "20260308T143022");
});

Deno.test("parseArgs — --dry-run", async () => {
  const opts = await parseArgs(["--dry-run"]);
  assertEquals(opts.dry_run, true);
});

Deno.test("parseArgs — --skip and --only", async () => {
  const opts = await parseArgs([
    "--skip",
    "meta-agent",
    "--only",
    "pm,tech-lead",
  ]);
  assertEquals(opts.skip_nodes, ["meta-agent"]);
  assertEquals(opts.only_nodes, ["pm", "tech-lead"]);
});

Deno.test("parseArgs — --env sets env_overrides", async () => {
  const opts = await parseArgs(["--env", "DEBUG=true"]);
  assertEquals(opts.env_overrides.DEBUG, "true");
});

Deno.test("parseArgs — --env without = rejects", async () => {
  try {
    await parseArgs(["--env", "INVALID"]);
    throw new Error("should have thrown");
  } catch (e) {
    assertEquals((e as Error).message.includes("Invalid --env format"), true);
  }
});

Deno.test("parseArgs — unknown flag rejects", async () => {
  try {
    await parseArgs(["badarg"]);
    throw new Error("should have thrown");
  } catch (e) {
    assertEquals((e as Error).message.includes("Unknown argument"), true);
  }
});

Deno.test("parseArgs — generic --key value arg", async () => {
  const opts = await parseArgs(["--foo", "bar"]);
  assertEquals(opts.args.foo, "bar");
});

Deno.test("parseArgs — -s sets semi-verbose", async () => {
  const opts = await parseArgs(["-s"]);
  assertEquals(opts.verbosity, "semi-verbose");
});

Deno.test("parseArgs — --semi-verbose sets semi-verbose", async () => {
  const opts = await parseArgs(["--semi-verbose"]);
  assertEquals(opts.verbosity, "semi-verbose");
});

Deno.test("parseArgs — -s combined with other flags", async () => {
  const opts = await parseArgs(["-s", "--prompt", "Do something"]);
  assertEquals(opts.verbosity, "semi-verbose");
  assertEquals(opts.args.prompt, "Do something");
});

Deno.test("parseArgs — default verbosity is normal", async () => {
  const opts = await parseArgs([]);
  assertEquals(opts.verbosity, "normal");
});

Deno.test("VERSION — is a non-empty string", () => {
  assertEquals(typeof VERSION, "string");
  assertEquals(VERSION.length > 0, true);
});

Deno.test("getVersionString — format is 'flowai-workflow v<version>'", () => {
  assertEquals(getVersionString(), `flowai-workflow v${VERSION}`);
});

Deno.test("extractCliFlags — absent flag keeps args intact", () => {
  const { skipUpdateCheck, remaining } = extractCliFlags([
    "--prompt",
    "Fix",
    "-v",
  ]);
  assertEquals(skipUpdateCheck, false);
  assertEquals(remaining, ["--prompt", "Fix", "-v"]);
});

Deno.test("extractCliFlags — --skip-update-check is stripped and flag set", () => {
  const { skipUpdateCheck, remaining } = extractCliFlags([
    "--skip-update-check",
    "--prompt",
    "Fix",
  ]);
  assertEquals(skipUpdateCheck, true);
  assertEquals(remaining, ["--prompt", "Fix"]);
});

Deno.test("extractCliFlags — --skip-update-check can appear anywhere", () => {
  const { skipUpdateCheck, remaining } = extractCliFlags([
    "--workflow",
    ".flowai-workflow/x",
    "--skip-update-check",
    "-v",
  ]);
  assertEquals(skipUpdateCheck, true);
  assertEquals(remaining, ["--workflow", ".flowai-workflow/x", "-v"]);
});

Deno.test("extractCliFlags — output passes through parseArgs cleanly", () => {
  const { skipUpdateCheck, remaining } = extractCliFlags([
    "--skip-update-check",
    "--prompt",
    "Ship it",
    "-q",
  ]);
  assertEquals(skipUpdateCheck, true);
  const opts = parseArgs(remaining);
  assertEquals(opts.args.prompt, "Ship it");
  assertEquals(opts.verbosity, "quiet");
});

Deno.test("parseArgs — --budget sets budget_usd as float", () => {
  const opts = parseArgs(["--budget", "12.5"]);
  assertEquals(opts.budget_usd, 12.5);
});

Deno.test("parseArgs — --budget integer accepted", () => {
  const opts = parseArgs(["--budget", "50"]);
  assertEquals(opts.budget_usd, 50);
});

Deno.test("parseArgs — missing --budget leaves budget_usd undefined", () => {
  const opts = parseArgs([]);
  assertEquals(opts.budget_usd, undefined);
});

Deno.test("parseArgs — --budget 0 rejects", () => {
  try {
    parseArgs(["--budget", "0"]);
    throw new Error("should have thrown");
  } catch (e) {
    assertEquals((e as Error).message.includes("Invalid --budget"), true);
  }
});

Deno.test("parseArgs — --budget negative rejects", () => {
  try {
    parseArgs(["--budget", "-1"]);
    throw new Error("should have thrown");
  } catch (e) {
    assertEquals((e as Error).message.includes("Invalid --budget"), true);
  }
});

Deno.test("parseArgs — --budget non-numeric rejects", () => {
  try {
    parseArgs(["--budget", "abc"]);
    throw new Error("should have thrown");
  } catch (e) {
    assertEquals((e as Error).message.includes("Invalid --budget"), true);
  }
});

// --- FR-E53: --workflow flag + autodiscovery -----------------------------

async function makeWorkflowFolder(
  root: string,
  name: string,
): Promise<string> {
  const dir = join(root, name);
  await Deno.mkdir(dir, { recursive: true });
  await Deno.writeTextFile(
    join(dir, "workflow.yaml"),
    `name: ${name}\nversion: "1"\nnodes: {}\n`,
  );
  return dir;
}

Deno.test("listWorkflows — discovers subfolders containing workflow.yaml", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "fr-e53-list-" });
  try {
    const root = join(tmp, ".flowai-workflow");
    await makeWorkflowFolder(root, "alpha");
    await makeWorkflowFolder(root, "beta");
    // Folder without workflow.yaml is ignored.
    await Deno.mkdir(join(root, "scripts"), { recursive: true });
    const found = await listWorkflows(root);
    assertEquals(found.sort(), [
      `${root}/alpha`,
      `${root}/beta`,
    ]);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("listWorkflows — missing root returns empty list (fresh project)", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "fr-e53-empty-" });
  try {
    const found = await listWorkflows(join(tmp, "no-such-dir"));
    assertEquals(found, []);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("resolveWorkflowConfigPath — explicit --workflow returns yaml path", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "fr-e53-explicit-" });
  try {
    const dir = await makeWorkflowFolder(tmp, "github-inbox");
    const yaml = await resolveWorkflowConfigPath(dir);
    assertEquals(yaml, `${dir}/workflow.yaml`);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("resolveWorkflowConfigPath — explicit --workflow with missing yaml errors", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "fr-e53-missing-" });
  try {
    await Deno.mkdir(join(tmp, "empty"));
    await assertRejects(
      () => resolveWorkflowConfigPath(join(tmp, "empty")),
      Error,
      "No workflow.yaml",
    );
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("resolveWorkflowConfigPath — autodetect with single candidate succeeds", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "fr-e53-single-" });
  try {
    const root = join(tmp, ".flowai-workflow");
    const dir = await makeWorkflowFolder(root, "github-inbox");
    const yaml = await resolveWorkflowConfigPath(undefined, root);
    assertEquals(yaml, `${dir}/workflow.yaml`);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("resolveWorkflowConfigPath — autodetect with multiple candidates errors with listing", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "fr-e53-multi-" });
  try {
    const root = join(tmp, ".flowai-workflow");
    await makeWorkflowFolder(root, "alpha");
    await makeWorkflowFolder(root, "beta");
    await assertRejects(
      () => resolveWorkflowConfigPath(undefined, root),
      Error,
      "Multiple workflows",
    );
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("resolveWorkflowConfigPath — empty root suggests `flowai-workflow init`", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "fr-e53-zero-" });
  try {
    const root = join(tmp, ".flowai-workflow");
    await Deno.mkdir(root);
    await assertRejects(
      () => resolveWorkflowConfigPath(undefined, root),
      Error,
      "flowai-workflow init",
    );
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});
