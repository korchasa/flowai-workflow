import { assertEquals } from "@std/assert";
import {
  checkArgs,
  printUsage,
  validateAgentListContent,
  validateDocsTokenBudget,
  validateHitlArtifactSource,
} from "./check.ts";

// --- printUsage ---

Deno.test("printUsage — contains Usage and deno task check", () => {
  const text = printUsage();
  assertEquals(text.includes("Usage:"), true);
  assertEquals(text.includes("deno task check"), true);
});

Deno.test("printUsage — mentions checks performed", () => {
  const text = printUsage();
  assertEquals(text.includes("Formatting check"), true);
  assertEquals(text.includes("Linting"), true);
  assertEquals(text.includes("Tests"), true);
  assertEquals(text.includes("Workflow integrity"), true);
  assertEquals(text.includes("AGENTS.md agent list accuracy"), true);
  assertEquals(text.includes("Comment marker scan"), true);
});

// --- checkArgs ---

Deno.test("checkArgs — --help returns usage text with code 0", () => {
  const result = checkArgs(["--help"]);
  assertEquals(result?.code, 0);
  assertEquals(result?.text.includes("deno task check"), true);
});

Deno.test("checkArgs — -h returns usage text with code 0", () => {
  const result = checkArgs(["-h"]);
  assertEquals(result?.code, 0);
  assertEquals(result?.text.includes("deno task check"), true);
});

Deno.test("checkArgs — unknown arg returns error string with code 1", () => {
  const result = checkArgs(["--verbose"]);
  assertEquals(result?.code, 1);
  assertEquals(result?.text.includes("Unknown argument: --verbose"), true);
  assertEquals(result?.text.includes("--help"), true);
});

Deno.test("checkArgs — unknown positional arg returns error with code 1", () => {
  const result = checkArgs(["somefile"]);
  assertEquals(result?.code, 1);
  assertEquals(result?.text.includes("Unknown argument: somefile"), true);
});

Deno.test("checkArgs — empty args returns null (ok)", () => {
  const result = checkArgs([]);
  assertEquals(result, null);
});

// --- validateAgentListContent ---

Deno.test("validateAgentListContent — valid 6-agent content passes", () => {
  const content =
    "## Project Vision\nPM, Architect, Tech Lead, Developer, QA, Tech Lead Review\n\n## Next Section\n";
  const errors = validateAgentListContent(content);
  assertEquals(errors, []);
});

Deno.test("validateAgentListContent — missing agent fails", () => {
  const content =
    "## Project Vision\nPM, Architect, Tech Lead, Developer, QA\n\n## Next\n";
  const errors = validateAgentListContent(content);
  assertEquals(
    errors.some((e: string) => e.includes("Tech Lead Review")),
    true,
  );
});

Deno.test("validateAgentListContent — deprecated agent Presenter fails", () => {
  const content =
    "## Project Vision\nPM, Architect, Tech Lead, Developer, QA, Tech Lead Review, Presenter\n\n## Next\n";
  const errors = validateAgentListContent(content);
  assertEquals(errors.some((e: string) => e.includes("Presenter")), true);
});

Deno.test("validateAgentListContent — deprecated agent Reviewer fails", () => {
  const content =
    "## Project Vision\nPM, Architect, Tech Lead, Developer, QA, Tech Lead Review\n\nReviewer also exists\n## Next\n";
  const errors = validateAgentListContent(content);
  assertEquals(errors.some((e: string) => e.includes("Reviewer")), true);
});

Deno.test("validateAgentListContent — missing Project Vision section fails", () => {
  const content = "## Some Section\ncontent\n";
  const errors = validateAgentListContent(content);
  assertEquals(
    errors.some((e: string) => e.includes("Project Vision")),
    true,
  );
});

Deno.test("validateAgentListContent — real AGENTS.md passes", async () => {
  const content = await Deno.readTextFile("AGENTS.md");
  const errors = validateAgentListContent(content);
  assertEquals(errors, []);
});

// --- validateHitlArtifactSource ---

Deno.test("validateHitlArtifactSource — valid template path passes", () => {
  const errors = validateHitlArtifactSource(
    "{{input.specification}}/01-spec.md",
  );
  assertEquals(errors, []);
});

Deno.test("validateHitlArtifactSource — hardcoded path fails", () => {
  const errors = validateHitlArtifactSource("plan/specification/01-spec.md");
  assertEquals(errors.length > 0, true);
  assertEquals(errors.some((e: string) => e.includes("artifact_source")), true);
});

Deno.test("validateHitlArtifactSource — absent field skips (passes)", () => {
  const errors = validateHitlArtifactSource(undefined);
  assertEquals(errors, []);
});

Deno.test("validateHitlArtifactSource — empty string skips (passes)", () => {
  const errors = validateHitlArtifactSource("");
  assertEquals(errors, []);
});

// --- validateDocsTokenBudget ---

Deno.test("validateDocsTokenBudget — empty input returns no offenders", () => {
  assertEquals(validateDocsTokenBudget([], 30000), []);
});

Deno.test("validateDocsTokenBudget — file under budget passes", () => {
  const offenders = validateDocsTokenBudget(
    [{ path: "documents/small.md", size: 1234 }],
    30000,
  );
  assertEquals(offenders, []);
});

Deno.test("validateDocsTokenBudget — file exactly at budget passes (strict >)", () => {
  const offenders = validateDocsTokenBudget(
    [{ path: "documents/boundary.md", size: 30000 }],
    30000,
  );
  assertEquals(offenders, []);
});

Deno.test("validateDocsTokenBudget — file over budget reports one offender", () => {
  const offenders = validateDocsTokenBudget(
    [{ path: "documents/big.md", size: 40000 }],
    30000,
  );
  assertEquals(offenders.length, 1);
  assertEquals(offenders[0].includes("documents/big.md"), true);
  assertEquals(offenders[0].includes("40000 bytes"), true);
  assertEquals(offenders[0].includes("30000 bytes budget"), true);
});

Deno.test("validateDocsTokenBudget — offender message includes estimated token count", () => {
  // 34000 bytes / 3.4 B/tok = 10000 tok
  const offenders = validateDocsTokenBudget(
    [{ path: "documents/a.md", size: 34000 }],
    30000,
  );
  assertEquals(offenders[0].includes("~10000 tok"), true);
});

Deno.test("validateDocsTokenBudget — mixed list returns only over-budget entries", () => {
  const offenders = validateDocsTokenBudget(
    [
      { path: "documents/a.md", size: 1000 },
      { path: "documents/b.md", size: 50000 },
      { path: "documents/c.md", size: 29999 },
      { path: "documents/d.md", size: 30001 },
    ],
    30000,
  );
  assertEquals(offenders.length, 2);
  assertEquals(offenders[0].includes("documents/b.md"), true);
  assertEquals(offenders[1].includes("documents/d.md"), true);
});
