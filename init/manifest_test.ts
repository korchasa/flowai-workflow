import { assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import { loadTemplateManifest, parseTemplateManifest } from "./manifest.ts";

// ---------------------------------------------------------------------------
// parseTemplateManifest — pure YAML string → structured manifest.
// ---------------------------------------------------------------------------

const MINIMAL_YAML = `
name: "test-template"
version: "1"
description: "Test"
requires:
  - { kind: git_remote, host: "github.com" }
questions:
  - key: PROJECT_NAME
    label: "Project name"
    detect: project_name
    required: true
  - key: DEFAULT_BRANCH
    label: "Default branch"
    detect: default_branch
    default: "main"
  - key: TEST_CMD
    label: "Test command"
    detect: test_cmd
    default: ""
  - key: LINT_CMD
    label: "Lint command"
    detect: lint_cmd
    default: ""
files:
  copy:
    - from: "files/.flowai-workflow/**"
      to:   ".flowai-workflow/"
`;

Deno.test("parseTemplateManifest — parses a valid YAML document", () => {
  const manifest = parseTemplateManifest(MINIMAL_YAML);
  assertEquals(manifest.name, "test-template");
  assertEquals(manifest.version, "1");
  assertEquals(manifest.description, "Test");
  assertEquals(manifest.requires.length, 1);
  assertEquals(manifest.requires[0].kind, "git_remote");
  assertEquals(manifest.requires[0].host, "github.com");
  assertEquals(manifest.questions.length, 4);
  assertEquals(manifest.questions[0].key, "PROJECT_NAME");
  assertEquals(manifest.questions[0].required, true);
  assertEquals(manifest.questions[0].detect, "project_name");
  assertEquals(manifest.files.copy.length, 1);
  assertEquals(manifest.files.copy[0].from, "files/.flowai-workflow/**");
  assertEquals(manifest.files.copy[0].to, ".flowai-workflow/");
});

Deno.test("parseTemplateManifest — rejects missing name", () => {
  const bad = 'version: "1"\nrequires: []\nquestions: []\nfiles:\n  copy: []\n';
  try {
    parseTemplateManifest(bad);
    throw new Error("expected throw");
  } catch (err) {
    const msg = (err as Error).message;
    if (!msg.includes("name")) {
      throw new Error(`expected 'name' in error: ${msg}`);
    }
  }
});

Deno.test("parseTemplateManifest — rejects unknown question key", () => {
  const bad = `
name: "x"
version: "1"
requires: []
questions:
  - key: UNKNOWN_FIELD
    label: "bad"
files:
  copy: []
`;
  try {
    parseTemplateManifest(bad);
    throw new Error("expected throw");
  } catch (err) {
    const msg = (err as Error).message;
    if (!msg.includes("UNKNOWN_FIELD")) {
      throw new Error(`expected question key in error: ${msg}`);
    }
  }
});

Deno.test("parseTemplateManifest — rejects invalid detect handler", () => {
  const bad = `
name: "x"
version: "1"
requires: []
questions:
  - key: PROJECT_NAME
    label: "x"
    detect: not_a_handler
files:
  copy: []
`;
  try {
    parseTemplateManifest(bad);
    throw new Error("expected throw");
  } catch (err) {
    const msg = (err as Error).message;
    if (!msg.includes("not_a_handler")) {
      throw new Error(`expected handler name in error: ${msg}`);
    }
  }
});

// ---------------------------------------------------------------------------
// loadTemplateManifest — reads file from disk via URL resolution.
// ---------------------------------------------------------------------------

Deno.test("loadTemplateManifest — loads bundled sdlc-claude manifest", async () => {
  // Reads the real template.yaml shipped in flowai-init/templates/.
  const url = new URL(
    "./templates/sdlc-claude/template.yaml",
    import.meta.url,
  );
  const manifest = await loadTemplateManifest(url);
  assertEquals(manifest.name, "sdlc-claude");
  assertEquals(manifest.questions.length, 5);
});

Deno.test("loadTemplateManifest — throws on missing file", async () => {
  const url = new URL(
    "./templates/definitely-missing/template.yaml",
    import.meta.url,
  );
  await assertRejects(() => loadTemplateManifest(url));
});

Deno.test("loadTemplateManifest — can load from arbitrary path", async () => {
  const tmp = await Deno.makeTempDir();
  try {
    const path = join(tmp, "template.yaml");
    await Deno.writeTextFile(path, MINIMAL_YAML);
    const url = new URL(`file://${path}`);
    const manifest = await loadTemplateManifest(url);
    assertEquals(manifest.name, "test-template");
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});
