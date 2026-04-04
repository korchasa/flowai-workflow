import { assertEquals } from "@std/assert";
import { stripVersionPrefix, TARGETS } from "./compile.ts";

Deno.test("TARGETS — has exactly 4 platform targets", () => {
  assertEquals(TARGETS.length, 4);
});

Deno.test("TARGETS — linux x86_64 maps to flowai-workflow-linux-x86_64", () => {
  const t = TARGETS.find((t) => t.triple === "x86_64-unknown-linux-gnu");
  assertEquals(t?.name, "flowai-workflow-linux-x86_64");
});

Deno.test("TARGETS — linux arm64 maps to flowai-workflow-linux-arm64", () => {
  const t = TARGETS.find((t) => t.triple === "aarch64-unknown-linux-gnu");
  assertEquals(t?.name, "flowai-workflow-linux-arm64");
});

Deno.test("TARGETS — darwin x86_64 maps to flowai-workflow-darwin-x86_64", () => {
  const t = TARGETS.find((t) => t.triple === "x86_64-apple-darwin");
  assertEquals(t?.name, "flowai-workflow-darwin-x86_64");
});

Deno.test("TARGETS — darwin arm64 maps to flowai-workflow-darwin-arm64", () => {
  const t = TARGETS.find((t) => t.triple === "aarch64-apple-darwin");
  assertEquals(t?.name, "flowai-workflow-darwin-arm64");
});

Deno.test("TARGETS — all names follow flowai-workflow-<os>-<arch> naming convention", () => {
  for (const { name } of TARGETS) {
    assertEquals(
      name.startsWith("flowai-workflow-"),
      true,
      `${name} does not start with flowai-workflow-`,
    );
    const suffix = name.slice("flowai-workflow-".length);
    assertEquals(
      suffix.includes("-"),
      true,
      `${name} suffix "${suffix}" missing os-arch separator`,
    );
  }
});

Deno.test("stripVersionPrefix — strips leading v from version tag", () => {
  assertEquals(stripVersionPrefix("v1.2.3"), "1.2.3");
});

Deno.test("stripVersionPrefix — leaves plain version without v unchanged", () => {
  assertEquals(stripVersionPrefix("1.2.3"), "1.2.3");
});

Deno.test("stripVersionPrefix — dev default unchanged", () => {
  assertEquals(stripVersionPrefix("dev"), "dev");
});
