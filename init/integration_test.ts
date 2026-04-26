/**
 * @module
 * Integration tests for `runInit` — stand up a real tmp git repo, run the
 * full scaffold path against it in `--answers` mode (no TTY), and assert
 * on the resulting file tree.
 *
 * These tests require the `git` binary. They skip silently if git is not
 * available (same convention as `preflight_test.ts`).
 */

import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { runInit } from "./mod.ts";

async function haveGit(): Promise<boolean> {
  try {
    const { success } = await new Deno.Command("git", {
      args: ["--version"],
      stdout: "null",
      stderr: "null",
    }).output();
    return success;
  } catch {
    return false;
  }
}

async function git(
  cwd: string,
  args: string[],
): Promise<void> {
  const { success, stderr } = await new Deno.Command("git", {
    cwd,
    args,
    stdout: "null",
    stderr: "piped",
  }).output();
  if (!success) {
    throw new Error(
      `git ${args.join(" ")}: ${new TextDecoder().decode(stderr)}`,
    );
  }
}

async function setupFakeProject(root: string): Promise<void> {
  await git(root, ["init", "-q"]);
  await git(root, ["config", "user.email", "test@example.com"]);
  await git(root, ["config", "user.name", "test"]);
  await git(root, [
    "remote",
    "add",
    "origin",
    "https://github.com/acme/demo.git",
  ]);
  // Minimal deno.json so autodetect can fire.
  await Deno.writeTextFile(
    join(root, "deno.json"),
    JSON.stringify({
      name: "acme-demo",
      tasks: { check: "deno task check" },
    }),
  );
  // Commit so working tree is clean — preflight rejects dirty tree
  // unless allow-dirty is passed, and we want to exercise the clean
  // path by default.
  await git(root, ["add", "deno.json"]);
  await git(root, ["commit", "-q", "-m", "init"]);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

Deno.test("runInit — scaffolds a fresh project end-to-end", async () => {
  if (!await haveGit()) return;
  const root = await Deno.makeTempDir({ prefix: "flowai-init-it-" });
  try {
    await setupFakeProject(root);

    // Write an --answers file; keeps the test non-interactive and
    // reproducible. PROJECT_NAME intentionally different from autodetect
    // so we can assert the override path.
    const answersPath = join(root, "answers.yaml");
    await Deno.writeTextFile(
      answersPath,
      [
        "PROJECT_NAME: integration-test",
        "DEFAULT_BRANCH: main",
        "TEST_CMD: deno task test",
        "LINT_CMD: deno task check",
      ].join("\n"),
    );

    const exitCode = await runInit(
      [
        "--answers",
        answersPath,
        // setupFakeProject leaves a clean tree after the init commit,
        // but the answers.yaml we just wrote is now untracked. Skip the
        // clean-tree check for this test.
        "--allow-dirty",
      ],
      { cwd: root, engineVersion: "test-0.0.0" },
    );
    assertEquals(exitCode, 0);

    const targetDir = join(root, ".flowai-workflow");
    // FR-S47: workflow assets live under `.flowai-workflow/<WORKFLOW_NAME>/`.
    // The integration fixture omits WORKFLOW_NAME so the default ("default")
    // is used.
    const workflowDir = join(targetDir, "default");

    // Core scaffolded files.
    const workflowYaml = join(workflowDir, "workflow.yaml");
    const workflow = await Deno.readTextFile(workflowYaml);
    // No placeholders remain — both __PROJECT_NAME__ and __WORKFLOW_NAME__
    // are substituted at copy time.
    if (workflow.includes("__PROJECT_NAME__")) {
      throw new Error(
        "workflow.yaml still contains __PROJECT_NAME__ placeholder",
      );
    }
    if (!workflow.includes('name: "default"')) {
      throw new Error(
        "workflow.yaml missing substituted workflow name (expected `default`)",
      );
    }

    // Generic substitutions everywhere — no __ placeholder should remain.
    const allFiles = [
      workflowYaml,
      join(workflowDir, "agents", "agent-pm.md"),
      join(workflowDir, "agents", "agent-architect.md"),
      join(workflowDir, "agents", "agent-tech-lead.md"),
      join(workflowDir, "agents", "agent-developer.md"),
      join(workflowDir, "agents", "agent-qa.md"),
      join(workflowDir, "agents", "agent-tech-lead-review.md"),
      join(workflowDir, "memory", "reflection-protocol.md"),
      join(workflowDir, "memory", "agent-pm.md"),
      join(workflowDir, "memory", "agent-pm-history.md"),
      join(workflowDir, "scripts", "hitl-ask.sh"),
      join(workflowDir, "scripts", "hitl-check.sh"),
      join(workflowDir, ".gitignore"),
    ];
    for (const path of allFiles) {
      if (!await fileExists(path)) {
        throw new Error(`expected file missing after scaffold: ${path}`);
      }
      const content = await Deno.readTextFile(path);
      if (/__[A-Z][A-Z0-9_]*__/.test(content)) {
        const m = content.match(/__[A-Z][A-Z0-9_]*__/);
        throw new Error(
          `${path} still contains placeholder: ${m?.[0]}`,
        );
      }
    }

    // Metadata file.
    const metaRaw = await Deno.readTextFile(
      join(targetDir, ".template.json"),
    );
    const meta = JSON.parse(metaRaw) as {
      version: number;
      template: string;
      engine_version: string;
      answers: { PROJECT_NAME: string };
    };
    assertEquals(meta.version, 1);
    assertEquals(meta.template, "sdlc-claude");
    assertEquals(meta.engine_version, "test-0.0.0");
    assertEquals(meta.answers.PROJECT_NAME, "integration-test");

    // Self-containment invariant: nothing was written outside
    // .flowai-workflow/. The project root should only contain:
    //   - .git/          (from git init)
    //   - deno.json      (pre-scaffold fixture)
    //   - answers.yaml   (pre-scaffold fixture)
    //   - .flowai-workflow/ (the scaffold)
    const rootEntries: string[] = [];
    for await (const entry of Deno.readDir(root)) {
      rootEntries.push(entry.name);
    }
    rootEntries.sort();
    const expectedTopLevel = [
      ".flowai-workflow",
      ".git",
      "answers.yaml",
      "deno.json",
    ].sort();
    assertEquals(rootEntries, expectedTopLevel);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("runInit — --dry-run prints files without writing", async () => {
  if (!await haveGit()) return;
  const root = await Deno.makeTempDir({ prefix: "flowai-init-dry-" });
  try {
    await setupFakeProject(root);
    const answersPath = join(root, "answers.yaml");
    await Deno.writeTextFile(
      answersPath,
      [
        "PROJECT_NAME: dry-run-demo",
        "DEFAULT_BRANCH: main",
        "TEST_CMD: deno task test",
        "LINT_CMD: deno task check",
      ].join("\n"),
    );

    const exitCode = await runInit(
      [
        "--answers",
        answersPath,
        "--dry-run",
        "--allow-dirty",
      ],
      { cwd: root, engineVersion: "dry-0.0.0" },
    );
    assertEquals(exitCode, 0);

    // No .flowai-workflow directory should exist after --dry-run.
    const exists = await fileExists(join(root, ".flowai-workflow"));
    assertEquals(exists, false);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("runInit — fails when .flowai-workflow already exists", async () => {
  if (!await haveGit()) return;
  const root = await Deno.makeTempDir({ prefix: "flowai-init-conflict-" });
  try {
    await setupFakeProject(root);
    await Deno.mkdir(join(root, ".flowai-workflow"));
    const answersPath = join(root, "answers.yaml");
    await Deno.writeTextFile(
      answersPath,
      [
        "PROJECT_NAME: x",
        "DEFAULT_BRANCH: main",
        "TEST_CMD: deno task test",
        "LINT_CMD: deno task check",
      ].join("\n"),
    );

    const exitCode = await runInit(
      ["--answers", answersPath, "--allow-dirty"],
      { cwd: root, engineVersion: "test" },
    );
    assertEquals(exitCode, 1);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("runInit — returns 3 on unknown argument", async () => {
  const exitCode = await runInit(["--nope-flag"]);
  assertEquals(exitCode, 3);
});

Deno.test("runInit — returns 0 on --help", async () => {
  const exitCode = await runInit(["--help"]);
  assertEquals(exitCode, 0);
});

// --- FR-S46/FR-S47/DoD-7: WORKFLOW_NAME drives folder + name --------------

Deno.test(
  "runInit — WORKFLOW_NAME answer scaffolds .flowai-workflow/<name>/",
  async () => {
    if (!await haveGit()) return;
    const root = await Deno.makeTempDir({ prefix: "flowai-init-wname-" });
    try {
      await setupFakeProject(root);
      const answersPath = join(root, "answers.yaml");
      await Deno.writeTextFile(
        answersPath,
        [
          "PROJECT_NAME: scaffold-demo",
          "WORKFLOW_NAME: test-flow",
          "DEFAULT_BRANCH: main",
          "TEST_CMD: deno task test",
          "LINT_CMD: deno task check",
        ].join("\n"),
      );
      const exitCode = await runInit(
        ["--answers", answersPath, "--allow-dirty"],
        { cwd: root, engineVersion: "test-0.0.0" },
      );
      assertEquals(exitCode, 0);

      const targetDir = join(root, ".flowai-workflow");
      const wfDir = join(targetDir, "test-flow");

      // Workflow folder is at .flowai-workflow/test-flow/
      const yaml = await Deno.readTextFile(join(wfDir, "workflow.yaml"));
      assertEquals(yaml.includes('name: "test-flow"'), true);

      // Agents are inside the workflow folder.
      const agentStat = await Deno.stat(join(wfDir, "agents", "agent-pm.md"));
      assertEquals(agentStat.isFile, true);

      // Nothing was written into a flat .flowai-workflow/workflow.yaml.
      let flatExists = false;
      try {
        await Deno.stat(join(targetDir, "workflow.yaml"));
        flatExists = true;
      } catch {
        // Expected.
      }
      assertEquals(flatExists, false);

      // Nothing was written into the legacy IDE-native subagent registry.
      let claudeAgentsExists = false;
      try {
        await Deno.stat(join(root, ".claude", "agents"));
        claudeAgentsExists = true;
      } catch {
        // Expected.
      }
      assertEquals(claudeAgentsExists, false);
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  },
);
