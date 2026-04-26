/**
 * @module
 * Wizard = answer resolution + optional interactive prompting. Two code
 * paths:
 *
 * - **Non-interactive** (`--answers <file.yaml>`): read YAML → validate
 *   keys → merge with autodetected defaults → check required fields →
 *   done. No stdin/TTY access.
 * - **Interactive** (no `--answers` flag): use `@std/cli/prompts` to ask
 *   the user each question, pre-filled with the autodetected default,
 *   validated on submission.
 *
 * Pure functions (`parseAnswersYaml`, `mergeAnswers`, `resolveFinalAnswers`)
 * are factored out so they can be unit-tested without a TTY. The top-level
 * {@link runWizard} function is the only one that touches stdin.
 */

import { parse as parseYaml } from "@std/yaml";
import type { Answers, TemplateManifest, TemplateQuestion } from "./types.ts";

/** Keys that may appear in an `--answers` YAML file. */
const KNOWN_KEYS: ReadonlySet<keyof Answers> = new Set<keyof Answers>([
  "PROJECT_NAME",
  "WORKFLOW_NAME",
  "DEFAULT_BRANCH",
  "TEST_CMD",
  "LINT_CMD",
]);

/**
 * Parse a YAML string into a validated `Partial<Answers>`. Unknown keys
 * are a hard error — typos in a CI answers file should fail loudly.
 */
export function parseAnswersYaml(yaml: string): Partial<Answers> {
  const raw = parseYaml(yaml);
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(
      "--answers file must contain a YAML mapping at the root",
    );
  }
  const result: Partial<Answers> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!KNOWN_KEYS.has(k as keyof Answers)) {
      throw new Error(
        `--answers: unknown key "${k}". Known keys: ${
          [...KNOWN_KEYS].join(", ")
        }`,
      );
    }
    if (typeof v !== "string") {
      throw new Error(
        `--answers: key "${k}" must be a string, got ${typeof v}`,
      );
    }
    (result as Record<string, string>)[k] = v;
  }
  return result;
}

/** Convenience wrapper: read `path` and delegate to {@link parseAnswersYaml}. */
export async function readAnswersFile(
  path: string,
): Promise<Partial<Answers>> {
  const content = await Deno.readTextFile(path);
  return parseAnswersYaml(content);
}

/**
 * Merge two `Partial<Answers>` dictionaries. Values from `override` win
 * over `base`, EXCEPT when the override value is an empty string — empty
 * strings come from autodetect handlers that yielded nothing and must not
 * clobber a non-empty base.
 */
export function mergeAnswers(
  base: Partial<Answers>,
  override: Partial<Answers>,
): Partial<Answers> {
  const merged: Partial<Answers> = { ...base };
  for (const [k, v] of Object.entries(override)) {
    if (v === undefined) continue;
    if (v === "" && (base as Record<string, string>)[k]) continue;
    (merged as Record<string, string>)[k] = v as string;
  }
  return merged;
}

/**
 * Produce the final `Answers` object from detected defaults + file input,
 * applying per-question `default` fallbacks and enforcing `required` flags.
 * This is the non-interactive resolution path — used directly when
 * `--answers` is passed, and reused as the post-TTY finalizer by
 * {@link runWizard}.
 *
 * Throws when a required field is empty after all fallbacks.
 */
export function resolveFinalAnswers(
  manifest: TemplateManifest,
  detected: Partial<Answers>,
  fileAnswers: Partial<Answers>,
): Answers {
  const merged = mergeAnswers(detected, fileAnswers);

  const result: Partial<Answers> = {};
  for (const q of manifest.questions) {
    const current = (merged as Record<string, string>)[q.key];
    let value: string | undefined = current;
    if ((value === undefined || value === "") && q.default !== undefined) {
      value = q.default;
    }
    if ((value === undefined || value === "") && q.required) {
      throw new Error(
        `Missing required value for ${q.key} (${q.label}). ` +
          `Provide it via --answers or autodetect.`,
      );
    }
    (result as Record<string, string>)[q.key] = value ?? "";
  }
  return result as Answers;
}

/**
 * Options passed to the interactive wizard entry point.
 */
export interface WizardOptions {
  /** Parsed template manifest. */
  manifest: TemplateManifest;
  /** Values from autodetect (used as prompt defaults). */
  detected: Partial<Answers>;
  /** When true, skip all prompts and resolve from `detected` + `defaults`. */
  nonInteractive: boolean;
  /** File-provided answers (from `--answers <file>`). Takes precedence. */
  fileAnswers: Partial<Answers>;
}

/**
 * Entry point for wizard resolution. In non-interactive mode just calls
 * {@link resolveFinalAnswers}. In interactive mode, prompts the user for
 * each question using `@std/cli/prompts` and then calls the same
 * finalizer on the collected input.
 *
 * Each prompt defaults to the autodetected value, shown in brackets; the
 * user can accept it by pressing Enter or type a replacement. The final
 * confirm prompt lets the user abort before scaffold writes any files.
 */
export async function runWizard(opts: WizardOptions): Promise<Answers> {
  if (opts.nonInteractive) {
    return resolveFinalAnswers(opts.manifest, opts.detected, opts.fileAnswers);
  }

  const collected: Partial<Answers> = { ...opts.detected };
  const encoder = new TextEncoder();
  const stdoutWrite = (s: string) => Deno.stdout.writeSync(encoder.encode(s));

  stdoutWrite("\nflowai-workflow init\n");
  stdoutWrite("--------------------\n");
  stdoutWrite(
    `Template: ${opts.manifest.name} v${opts.manifest.version}\n`,
  );
  if (opts.manifest.description) {
    stdoutWrite(`${opts.manifest.description}\n`);
  }
  stdoutWrite("\n");

  for (const q of opts.manifest.questions) {
    const fromFile = opts.fileAnswers[q.key];
    if (fromFile !== undefined) {
      (collected as Record<string, string>)[q.key] = fromFile;
      continue;
    }
    const suggestedRaw = (collected as Record<string, string>)[q.key] ??
      q.default ?? "";
    const answer = await promptForQuestion(q, suggestedRaw);
    (collected as Record<string, string>)[q.key] = answer;
  }

  // Preview + confirm.
  stdoutWrite("\nSummary:\n");
  for (const q of opts.manifest.questions) {
    const value = (collected as Record<string, string>)[q.key];
    stdoutWrite(`  ${q.key}: ${value || "<empty>"}\n`);
  }
  stdoutWrite("\nScaffold with these values? [Y/n]: ");
  const confirmLine = (await readLine()).trim().toLowerCase();
  // Empty or y/yes → confirm; anything else → abort.
  if (
    confirmLine !== "" && confirmLine !== "y" && confirmLine !== "yes"
  ) {
    throw new Error("Scaffold aborted by user");
  }

  return resolveFinalAnswers(opts.manifest, collected, {});
}

/**
 * Ask a single question with an optional default value. Reads a line from
 * stdin; returns `defaultValue` when the user presses Enter on an empty
 * line. Synchronous/blocking — used only in interactive mode.
 */
function promptForQuestion(
  q: TemplateQuestion,
  defaultValue: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const write = (s: string) => Deno.stdout.writeSync(encoder.encode(s));

  const label = defaultValue
    ? `${q.label} [${defaultValue}]: `
    : `${q.label}: `;
  write(label);

  return readLine().then((line) => {
    const trimmed = line.trim();
    const value = trimmed.length > 0 ? trimmed : defaultValue;
    if (q.required && value.length === 0) {
      throw new Error(`${q.key} is required`);
    }
    return value;
  });
}

/**
 * Read one line from stdin (no trailing newline). Returns empty string on
 * EOF. Minimal implementation — no history, no editing.
 */
async function readLine(): Promise<string> {
  const buf = new Uint8Array(4096);
  const n = await Deno.stdin.read(buf);
  if (n === null) return "";
  const raw = new TextDecoder().decode(buf.subarray(0, n));
  // Strip trailing newline (\n or \r\n).
  return raw.replace(/\r?\n$/, "");
}
