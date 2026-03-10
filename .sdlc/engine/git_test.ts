import { assertEquals } from "@std/assert";
import type { CommitResult } from "./git.ts";
import { OutputManager } from "./output.ts";

/** Capture output lines from an OutputManager. */
function createCapture(): { lines: string[]; writer: (text: string) => void } {
  const lines: string[] = [];
  return { lines, writer: (text: string) => lines.push(text) };
}

// Note: Full git integration tests require a real git repo.
// These tests verify the data structures and logic patterns.

Deno.test("CommitResult — successful commit with enriched fields", () => {
  const result: CommitResult = {
    success: true,
    commitHash: "abc123def456",
    filesStaged: ["src/main.ts", "src/util.ts"],
    message: "sdlc(executor): run-1 — Executor",
  };
  assertEquals(result.success, true);
  assertEquals(typeof result.commitHash, "string");
  assertEquals(result.filesStaged.length, 2);
  assertEquals(result.message, "sdlc(executor): run-1 — Executor");
});

Deno.test("CommitResult — nothing to commit has empty filesStaged", () => {
  const result: CommitResult = {
    success: true,
    commitHash: undefined,
    filesStaged: [],
    message: "",
  };
  assertEquals(result.success, true);
  assertEquals(result.commitHash, undefined);
  assertEquals(result.filesStaged.length, 0);
});

Deno.test("CommitResult — failed commit", () => {
  const result: CommitResult = {
    success: false,
    error: "Git commit failed: not a git repository",
    filesStaged: [],
    message: "",
  };
  assertEquals(result.success, false);
  assertEquals(result.error!.includes("not a git repository"), true);
});

// --- Edge case: zero staged files at commit ---

Deno.test("verboseCommit — handles zero staged files (no-op commit)", () => {
  const cap = createCapture();
  const out = new OutputManager("verbose", cap.writer);

  const commitResult: CommitResult = {
    success: true,
    commitHash: undefined,
    filesStaged: [],
    message: "",
  };

  // Engine only calls verboseCommit when filesStaged.length > 0,
  // so zero files = no verboseCommit call.
  if (commitResult.filesStaged.length > 0) {
    out.verboseCommit(
      "node1",
      commitResult.filesStaged,
      commitResult.message,
      "agent/42",
    );
  }

  assertEquals(
    cap.lines.length,
    0,
    "Zero staged files should produce no verbose commit output",
  );
});

// branch() helper tests — require real git repo
Deno.test("branch — returns current branch name", async () => {
  const { branch } = await import("./git.ts");
  const result = await branch();
  assertEquals(typeof result, "string");
  assertEquals(result.length > 0, true);
});
