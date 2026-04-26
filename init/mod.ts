/**
 * @module
 * Public entry point for `flowai-workflow init`. Dispatched from
 * `engine/cli.ts` when the user runs `flowai-workflow init`.
 *
 * Usage:
 * ```ts
 * import { runInit } from "@korchasa/flowai-workflow-init";
 * const exitCode = await runInit(Deno.args);
 * Deno.exit(exitCode);
 * ```
 *
 * Exit codes:
 * - `0` — success (help, dry-run, or full scaffold completed)
 * - `1` — scaffold or preflight failed
 * - `3` — invalid CLI arguments
 */

import { fromFileUrl, join } from "@std/path";
import { loadTemplateManifest } from "./manifest.ts";
import { detectAll } from "./autodetect.ts";
import { runPreflight, summarizeFailures } from "./preflight.ts";
import { readAnswersFile, runWizard } from "./wizard.ts";
import {
  copyTemplate,
  substitutePlaceholders,
  unwindScaffold,
  writeTemplateMetadata,
} from "./scaffold.ts";
import type { Answers, TemplateManifest } from "./types.ts";

export type {
  Answers,
  CopyRule,
  DetectKey,
  TemplateManifest,
  TemplateQuestion,
  TemplateRequirement,
} from "./types.ts";

/** Options the engine passes down when invoking the init dispatcher. */
export interface RunInitOptions {
  /**
   * Engine version string recorded in `.template.json`. Defaults to
   * `"dev"` when the caller does not supply one — keeps the package
   * runnable from a plain `deno test` without the engine wired in.
   */
  engineVersion?: string;
  /**
   * Working directory the init command operates on. Defaults to
   * `Deno.cwd()`. Integration tests override this to run against
   * isolated temp directories.
   */
  cwd?: string;
}

// ---------------------------------------------------------------------------
// Flag parsing — pure, unit-testable. Returns a tagged union so the caller
// can route between help / error / run paths without inspecting fields.
// ---------------------------------------------------------------------------

/** Result of flag parsing — one of three shapes. */
export type ParsedInitArgs =
  | { kind: "help" }
  | { kind: "error"; message: string }
  | {
    kind: "run";
    template: string;
    answersFile?: string;
    dryRun: boolean;
    allowDirty: boolean;
  };

/**
 * Parse `init`-subcommand flags. Returns a tagged union describing the
 * action to take. Never touches stdin or the filesystem.
 */
export function parseInitArgs(args: string[]): ParsedInitArgs {
  let template = "sdlc-claude";
  let answersFile: string | undefined;
  let dryRun = false;
  let allowDirty = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "-h":
      case "--help":
        return { kind: "help" };
      case "--template": {
        const value = args[++i];
        if (value === undefined) {
          return {
            kind: "error",
            message: "--template requires a value",
          };
        }
        template = value;
        break;
      }
      case "--answers": {
        const value = args[++i];
        if (value === undefined) {
          return {
            kind: "error",
            message: "--answers requires a value (path to YAML file)",
          };
        }
        answersFile = value;
        break;
      }
      case "--dry-run":
        dryRun = true;
        break;
      case "--allow-dirty":
        allowDirty = true;
        break;
      default:
        return {
          kind: "error",
          message:
            `Unknown argument: ${arg}. Run \`flowai-workflow init --help\`.`,
        };
    }
  }

  return { kind: "run", template, answersFile, dryRun, allowDirty };
}

/** Help text printed by `flowai-workflow init --help`. */
export function initHelpText(): string {
  return `flowai-workflow init — scaffold a .flowai-workflow/ directory in the current project

Usage:
  flowai-workflow init [options]

Options:
  --template <name>        Template to use (default: sdlc-claude)
  --answers <file>         YAML file with pre-filled answers (non-interactive mode)
  --allow-dirty            Skip the clean-git-tree preflight check
  --dry-run                Print files that would be created, exit 0
  -h, --help               Show this help and exit

Exit codes:
  0  success (help, dry-run, or full scaffold completed)
  1  preflight or scaffold failed
  3  invalid arguments

Examples:
  flowai-workflow init
  flowai-workflow init --answers ci/init-answers.yaml
  flowai-workflow init --template sdlc-claude --dry-run`;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Entry point invoked by the engine dispatcher. Accepts the raw `argv`
 * (after the `init` subcommand is stripped) and returns an exit code.
 */
export async function runInit(
  argv: string[],
  opts: RunInitOptions = {},
): Promise<number> {
  const parsed = parseInitArgs(argv);
  if (parsed.kind === "help") {
    console.log(initHelpText());
    return 0;
  }
  if (parsed.kind === "error") {
    console.error(`Error: ${parsed.message}`);
    return 3;
  }

  const cwd = opts.cwd ?? Deno.cwd();
  const engineVersion = opts.engineVersion ?? "dev";
  const targetDir = join(cwd, ".flowai-workflow");

  // --- Load template manifest --------------------------------------------
  const templateRoot = resolveTemplateRoot(parsed.template);
  let manifest: TemplateManifest;
  try {
    manifest = await loadTemplateManifest(
      new URL("./template.yaml", addTrailingSlash(templateRoot)),
    );
  } catch (err) {
    console.error(
      `Error: could not load template "${parsed.template}": ` +
        `${(err as Error).message}`,
    );
    return 1;
  }

  // --- Preflight ---------------------------------------------------------
  const preflight = await runPreflight({
    cwd,
    targetDir,
    allowDirty: parsed.allowDirty,
  });
  if (preflight.failures.length > 0) {
    console.error(summarizeFailures(preflight.failures));
    return 1;
  }

  // --- Autodetect --------------------------------------------------------
  const detected = await detectAll(cwd);

  // --- Wizard ------------------------------------------------------------
  const fileAnswers = parsed.answersFile !== undefined
    ? await readAnswersFile(parsed.answersFile)
    : {};
  let answers: Answers;
  try {
    answers = await runWizard({
      manifest,
      detected,
      nonInteractive: parsed.answersFile !== undefined,
      fileAnswers,
    });
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    return 1;
  }

  // --- Dry-run short-circuit ---------------------------------------------
  if (parsed.dryRun) {
    console.log(
      `\nDry run — the following files would be written into ${targetDir}:`,
    );
    const fileList = await listTargetFiles(
      templateRoot,
      targetDir,
      manifest,
      answers,
    );
    for (const path of fileList) {
      console.log(`  ${path}`);
    }
    console.log(`\nTotal: ${fileList.length} files. No changes applied.`);
    return 0;
  }

  // --- Scaffold ----------------------------------------------------------
  let createdPaths: string[] = [];
  try {
    createdPaths = await copyTemplate(
      fromFileUrlCompat(templateRoot),
      cwd,
      manifest,
      answers,
    );
    await writeTemplateMetadata(
      join(targetDir, ".template.json"),
      manifest,
      answers,
      engineVersion,
    );
  } catch (err) {
    console.error(`Error: scaffold failed: ${(err as Error).message}`);
    await unwindScaffold(createdPaths);
    return 1;
  }

  // --- Success message ---------------------------------------------------
  const workflowName = (answers as unknown as Record<string, string>)
    .WORKFLOW_NAME ?? "default";
  const workflowDir = join(targetDir, workflowName);
  console.log(
    `\n✓ Initialized ${workflowDir} for project "${answers.PROJECT_NAME}"\n` +
      `Next steps:\n` +
      `  1. Review ${workflowDir}/agents/agent-*.md and edit for your project conventions (optional).\n` +
      `  2. Run: flowai-workflow run --workflow ${workflowDir}\n`,
  );
  return 0;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a template name to its on-disk root URL. Templates ship inside
 * the package under `./templates/<name>/`, reachable via `import.meta.url`
 * so the lookup works in all runtimes (local, JSR, compiled).
 */
function resolveTemplateRoot(name: string): URL {
  return new URL(`./templates/${name}/`, import.meta.url);
}

/** Ensure a `file://` URL string ends with `/` so `new URL(rel, base)` resolves inside it. */
function addTrailingSlash(url: URL): URL {
  if (url.pathname.endsWith("/")) return url;
  return new URL(url.href + "/");
}

/**
 * Convert a `file://` URL to a plain path for `copyTemplate`, which
 * accepts local filesystem paths. JSR-shipped templates are read via
 * `Deno.readTextFile(URL)` directly at the read site, but `copyTemplate`
 * needs a string root. This helper narrows the URL→path conversion and
 * throws if the URL is not a `file:` URL (e.g., fetched from JSR CDN,
 * which would require a different copy path not implemented in v1).
 */
function fromFileUrlCompat(url: URL): string {
  if (url.protocol !== "file:") {
    throw new Error(
      `Template root must be a file:// URL (got ${url.href}). ` +
        `JSR-remote template loading is not supported in v1.`,
    );
  }
  return fromFileUrl(url);
}

/**
 * Enumerate the list of relative paths that would be written by a real
 * scaffold run. Used by `--dry-run` to show the user what's about to
 * happen without actually touching disk.
 */
async function listTargetFiles(
  templateRootUrl: URL,
  targetDir: string,
  manifest: TemplateManifest,
  answers: Answers = {} as Answers,
): Promise<string[]> {
  const templateRoot = fromFileUrlCompat(templateRootUrl);
  const result: string[] = [];
  for (const rule of manifest.files.copy) {
    const fromRel = rule.from.replace(/\/+$/, "").replace(/\/\*\*$/, "");
    // FR-S46: `to:` may contain `__WORKFLOW_NAME__` (or other) placeholders.
    const toRel = substitutePlaceholders(rule.to, answers).replace(
      /\/+$/,
      "",
    );
    const ruleSrc = join(templateRoot, fromRel);
    for await (const relFile of walk(ruleSrc)) {
      result.push(join(targetDir, toRel, relFile));
    }
  }
  // .template.json is always written too.
  result.push(join(targetDir, ".template.json"));
  return result.sort();
}

/** Minimal async-generator walker that yields relative file paths. */
async function* walk(root: string): AsyncGenerator<string> {
  async function* inner(
    current: string,
    rel: string,
  ): AsyncGenerator<string> {
    for await (const entry of Deno.readDir(current)) {
      const full = join(current, entry.name);
      const relNext = rel.length > 0 ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory) {
        yield* inner(full, relNext);
      } else if (entry.isFile) {
        yield relNext;
      }
    }
  }
  yield* inner(root, "");
}
