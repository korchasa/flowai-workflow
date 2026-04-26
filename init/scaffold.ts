/**
 * @module
 * Pure file-copy + placeholder-substitution core. No network, no prompts,
 * no subprocess invocation. Takes wizard answers + a template manifest +
 * on-disk template root, writes the scaffolded tree into a target project
 * directory, and returns the list of created paths for unwind.
 */

import { dirname, join, relative } from "@std/path";
import type { Answers, TemplateManifest } from "./types.ts";

/** Regex matching `__UPPER_SNAKE__` placeholder tokens in template files. */
const PLACEHOLDER_RE = /__([A-Z][A-Z0-9_]*)__/g;

/**
 * Replace `__UPPER_SNAKE__` placeholders in `content` using values from
 * `answers`. Throws if the content contains any placeholder whose key is
 * not present in `answers` — unknown placeholders are a template bug, not
 * a user error.
 */
export function substitutePlaceholders(
  content: string,
  answers: Answers,
): string {
  return content.replace(PLACEHOLDER_RE, (match, key: string) => {
    const value = (answers as unknown as Record<string, string>)[key];
    if (value === undefined) {
      throw new Error(
        `Unknown placeholder ${match}: template references __${key}__ but ` +
          `no wizard answer is defined for that key`,
      );
    }
    return value;
  });
}

/**
 * Recursively walk a directory tree and return relative file paths
 * (with forward slashes, regardless of platform). Hidden entries that
 * start with `.` are included — `.gitignore` inside the template tree
 * is a valid asset to copy.
 */
export async function listTemplateFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  async function walk(current: string): Promise<void> {
    for await (const entry of Deno.readDir(current)) {
      const full = join(current, entry.name);
      if (entry.isDirectory) {
        await walk(full);
      } else if (entry.isFile) {
        result.push(relative(root, full));
      }
    }
  }
  await walk(root);
  return result;
}

/**
 * Copy a template tree into a target project directory, substituting
 * placeholders in every file. Walks each `files.copy` rule from the
 * manifest, walks the source glob, writes to destination with placeholders
 * filled.
 *
 * Invariants:
 * - Never overwrites existing files — throws if a target path already
 *   exists. Preflight is expected to have verified absence of `.flowai-
 *   workflow/`, but we defend in depth here.
 * - Every written path is appended to `createdPaths` BEFORE the write
 *   completes, so unwind-on-error can delete exactly the files that were
 *   touched (see {@link unwindScaffold}).
 * - Parent directories are created via `mkdir -p` semantics; they are
 *   NOT tracked in `createdPaths` (removing empty parents is intentionally
 *   best-effort and left to the caller after unwinding files).
 *
 * Returns the list of absolute paths written — used by the caller to
 * unwind on error.
 */
export async function copyTemplate(
  templateRoot: string,
  targetDir: string,
  manifest: TemplateManifest,
  answers: Answers,
): Promise<string[]> {
  const createdPaths: string[] = [];

  for (const rule of manifest.files.copy) {
    // Strip trailing slash(es) from rule.from (e.g. `files/` → `files`).
    const fromRel = rule.from.replace(/\/+$/, "").replace(/\/\*\*$/, "");
    // FR-S46: `rule.to` may contain `__UPPER_SNAKE__` placeholders that
    // resolve to wizard answers (e.g. `__WORKFLOW_NAME__`).
    const toRel = substitutePlaceholders(rule.to, answers).replace(
      /\/+$/,
      "",
    );
    const ruleSrc = join(templateRoot, fromRel);
    const ruleDst = join(targetDir, toRel);

    let srcInfo: Deno.FileInfo;
    try {
      srcInfo = await Deno.stat(ruleSrc);
    } catch (err) {
      throw new Error(
        `Template source missing for copy rule ${rule.from}: ${ruleSrc}`,
        { cause: err },
      );
    }
    if (!srcInfo.isDirectory) {
      throw new Error(
        `Template source must be a directory: ${ruleSrc}`,
      );
    }

    const relFiles = await listTemplateFiles(ruleSrc);
    for (const relFile of relFiles) {
      const srcFile = join(ruleSrc, relFile);
      const dstFile = join(ruleDst, relFile);

      // Refuse to overwrite — defense in depth beyond preflight.
      try {
        await Deno.stat(dstFile);
        throw new Error(
          `Target file already exists: ${dstFile}. Remove it manually ` +
            `or delete the parent directory to re-init.`,
        );
      } catch (err) {
        if (!(err instanceof Deno.errors.NotFound)) {
          throw err;
        }
      }

      const raw = await Deno.readTextFile(srcFile);
      const substituted = substitutePlaceholders(raw, answers);

      await Deno.mkdir(dirname(dstFile), { recursive: true });
      await Deno.writeTextFile(dstFile, substituted);
      createdPaths.push(dstFile);
    }
  }

  return createdPaths;
}

/**
 * Best-effort removal of paths created by {@link copyTemplate}. Walks the
 * list in reverse order, silently ignoring `NotFound` errors (the path
 * may have been removed by the user between scaffold and unwind).
 *
 * Only file paths are removed — parent directories that become empty are
 * left on disk so we never accidentally delete a user directory we didn't
 * create.
 */
export async function unwindScaffold(createdPaths: string[]): Promise<void> {
  for (const path of [...createdPaths].reverse()) {
    try {
      await Deno.remove(path);
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) continue;
      // Log and keep going — partial unwind is better than partial state.
      console.error(
        `unwind: failed to remove ${path}: ${(err as Error).message}`,
      );
    }
  }
}

/**
 * Write the `.template.json` metadata file that records template name,
 * engine version, timestamp, and wizard answers. Used by a future
 * `flowai-workflow update` command to diff installed template against
 * upstream.
 */
export async function writeTemplateMetadata(
  metadataPath: string,
  manifest: TemplateManifest,
  answers: Answers,
  engineVersion: string,
): Promise<void> {
  const payload = {
    version: 1,
    template: manifest.name,
    template_version: manifest.version,
    engine_version: engineVersion,
    created_at: new Date().toISOString(),
    answers,
  };
  await Deno.mkdir(dirname(metadataPath), { recursive: true });
  await Deno.writeTextFile(
    metadataPath,
    JSON.stringify(payload, null, 2) + "\n",
  );
}
