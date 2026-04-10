import { assertEquals } from "@std/assert";
import { checkArgs, printUsage } from "./loop-in-claude.ts";

// --- printUsage ---

Deno.test("printUsage — contains Usage and deno task loop-in-claude", () => {
  const text = printUsage();
  assertEquals(text.includes("Usage:"), true);
  assertEquals(text.includes("deno task loop-in-claude"), true);
});

Deno.test("printUsage — mentions passthrough args and examples", () => {
  const text = printUsage();
  assertEquals(text.includes("claude"), true);
  assertEquals(text.includes("Examples:"), true);
});

// --- checkArgs ---

Deno.test("checkArgs — --help returns usage text with code 0", () => {
  const result = checkArgs(["--help"]);
  assertEquals(result?.code, 0);
  assertEquals(result?.text.includes("loop-in-claude"), true);
});

Deno.test("checkArgs — -h returns usage text with code 0", () => {
  const result = checkArgs(["-h"]);
  assertEquals(result?.code, 0);
  assertEquals(result?.text.includes("loop-in-claude"), true);
});

Deno.test("checkArgs — --help detected in mixed claude args", () => {
  const result = checkArgs(["--verbose", "--help", "--model", "opus"]);
  assertEquals(result?.code, 0);
});

Deno.test("checkArgs — no help flag returns null (all args passed to claude)", () => {
  const result = checkArgs(["--verbose", "--model", "claude-opus-4-6"]);
  assertEquals(result, null);
});

Deno.test("checkArgs — empty args returns null", () => {
  const result = checkArgs([]);
  assertEquals(result, null);
});
