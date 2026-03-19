import { assertEquals } from "@std/assert";
import { collectPromptPaths, loadConfig } from "./config.ts";

const PIPELINE_PATH = ".auto-flow/pipeline.yaml";

Deno.test(
  "pipeline.yaml — no agent node uses prompt: field (FR-S38 AC#3)",
  async () => {
    const config = await loadConfig(PIPELINE_PATH);
    const paths = collectPromptPaths(config);
    assertEquals(
      paths,
      [],
      "FR-S38 AC#3: no agent node may use the prompt: field",
    );
  },
);

Deno.test("collectPromptPaths — extracts from top-level and loop body nodes", () => {
  const config = {
    name: "test",
    version: "1" as const,
    nodes: {
      a: {
        type: "agent" as const,
        label: "A",
        prompt: ".auto-flow/agents/agent-a/SKILL.md",
      },
      b: { type: "agent" as const, label: "B", task_template: "no prompt" },
      loop: {
        type: "loop" as const,
        label: "L",
        condition_node: "c",
        condition_field: "f",
        exit_value: "v",
        nodes: {
          c: {
            type: "agent" as const,
            label: "C",
            prompt: ".auto-flow/agents/agent-c/SKILL.md",
            task_template: "x",
          },
          d: { type: "agent" as const, label: "D", task_template: "y" },
        },
      },
    },
  };

  const paths = collectPromptPaths(config);
  assertEquals(paths, [
    ".auto-flow/agents/agent-a/SKILL.md",
    ".auto-flow/agents/agent-c/SKILL.md",
  ]);
});
