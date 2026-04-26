/**
 * @module
 * Template manifest loader — parses `template.yaml` into the typed
 * {@link TemplateManifest} shape and validates structural invariants:
 *
 * - required top-level fields (`name`, `version`, `questions`, `files.copy`);
 * - every question key matches a known placeholder (`PROJECT_NAME`,
 *   `DEFAULT_BRANCH`, `TEST_CMD`, `LINT_CMD`);
 * - every `detect:` references a known autodetect handler;
 * - `requires[]` entries match the expected kind/name shape.
 *
 * Unknown fields pass through as validation errors rather than being
 * silently ignored — a typo in `template.yaml` should fail loudly.
 */

import { parse as parseYaml } from "@std/yaml";
import type {
  Answers,
  CopyRule,
  DetectKey,
  TemplateManifest,
  TemplateQuestion,
  TemplateRequirement,
} from "./types.ts";

/** Keys that may appear in `questions[].key`. */
const KNOWN_QUESTION_KEYS: ReadonlySet<keyof Answers> = new Set<keyof Answers>(
  [
    "PROJECT_NAME",
    "WORKFLOW_NAME",
    "DEFAULT_BRANCH",
    "TEST_CMD",
    "LINT_CMD",
  ],
);

/** Known detect handler names matching `cli/init/autodetect.ts`. */
const KNOWN_DETECT_KEYS: ReadonlySet<DetectKey> = new Set<DetectKey>([
  "project_name",
  "default_branch",
  "test_cmd",
  "lint_cmd",
]);

// ---------------------------------------------------------------------------
// Validation helpers — build up a path context so error messages point to
// the offending YAML location (e.g., `questions[2].detect`).
// ---------------------------------------------------------------------------

function assertString(
  value: unknown,
  path: string,
): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`${path}: expected string, got ${typeof value}`);
  }
}

function assertRecord(
  value: unknown,
  path: string,
): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path}: expected object`);
  }
}

function assertArray(
  value: unknown,
  path: string,
): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path}: expected array`);
  }
}

function validateRequirement(
  raw: unknown,
  path: string,
): TemplateRequirement {
  assertRecord(raw, path);
  assertString(raw.kind, `${path}.kind`);
  if (raw.kind !== "git_remote") {
    throw new Error(
      `${path}.kind: must be "git_remote", got "${raw.kind}"`,
    );
  }
  const result: TemplateRequirement = { kind: raw.kind };
  if (raw.host !== undefined) {
    assertString(raw.host, `${path}.host`);
    result.host = raw.host;
  }
  if (!result.host) {
    throw new Error(`${path}: git_remote requirement must set \`host\``);
  }
  return result;
}

function validateQuestion(
  raw: unknown,
  path: string,
): TemplateQuestion {
  assertRecord(raw, path);
  assertString(raw.key, `${path}.key`);
  if (!KNOWN_QUESTION_KEYS.has(raw.key as keyof Answers)) {
    throw new Error(
      `${path}.key: unknown placeholder "${raw.key}". Known keys: ` +
        `${[...KNOWN_QUESTION_KEYS].join(", ")}`,
    );
  }
  assertString(raw.label, `${path}.label`);
  const result: TemplateQuestion = {
    key: raw.key as keyof Answers,
    label: raw.label,
  };
  if (raw.detect !== undefined) {
    assertString(raw.detect, `${path}.detect`);
    if (!KNOWN_DETECT_KEYS.has(raw.detect as DetectKey)) {
      throw new Error(
        `${path}.detect: unknown handler "${raw.detect}". Known handlers: ` +
          `${[...KNOWN_DETECT_KEYS].join(", ")}`,
      );
    }
    result.detect = raw.detect as DetectKey;
  }
  if (raw.default !== undefined) {
    assertString(raw.default, `${path}.default`);
    result.default = raw.default;
  }
  if (raw.required !== undefined) {
    if (typeof raw.required !== "boolean") {
      throw new Error(`${path}.required: expected boolean`);
    }
    result.required = raw.required;
  }
  return result;
}

function validateCopyRule(raw: unknown, path: string): CopyRule {
  assertRecord(raw, path);
  assertString(raw.from, `${path}.from`);
  assertString(raw.to, `${path}.to`);
  return { from: raw.from, to: raw.to };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a YAML string into a validated {@link TemplateManifest}. Throws on
 * any structural violation; error messages include the YAML path of the
 * offending field (e.g. `questions[2].detect`).
 */
export function parseTemplateManifest(yaml: string): TemplateManifest {
  const raw = parseYaml(yaml);
  assertRecord(raw, "template.yaml");

  assertString(raw.name, "name");
  assertString(raw.version, "version");

  const requires: TemplateRequirement[] = [];
  if (raw.requires !== undefined) {
    assertArray(raw.requires, "requires");
    raw.requires.forEach((entry, i) => {
      requires.push(validateRequirement(entry, `requires[${i}]`));
    });
  }

  assertArray(raw.questions, "questions");
  const questions: TemplateQuestion[] = raw.questions.map(
    (q, i) => validateQuestion(q, `questions[${i}]`),
  );

  assertRecord(raw.files, "files");
  assertArray(raw.files.copy, "files.copy");
  const copy: CopyRule[] = raw.files.copy.map(
    (r, i) => validateCopyRule(r, `files.copy[${i}]`),
  );

  const result: TemplateManifest = {
    name: raw.name,
    version: raw.version,
    requires,
    questions,
    files: { copy },
  };

  if (raw.description !== undefined) {
    assertString(raw.description, "description");
    result.description = raw.description;
  }

  return result;
}

/**
 * Load and parse `template.yaml` from a URL (file:// or JSR runtime URL).
 * Use `new URL("./templates/<name>/template.yaml", import.meta.url)` at the
 * call site to locate bundled templates — this keeps file access relative
 * to the shipping module regardless of runtime (local, JSR, compiled).
 */
export async function loadTemplateManifest(
  manifestUrl: URL,
): Promise<TemplateManifest> {
  const raw = await Deno.readTextFile(manifestUrl);
  return parseTemplateManifest(raw);
}
