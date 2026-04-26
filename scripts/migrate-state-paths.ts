#!/usr/bin/env -S deno run -A
/**
 * @module
 * One-shot migration helper for end-user `state.json` files written under
 * the legacy flat `.flowai-workflow/` layout (single workflow, runs/ at
 * top level). Walks every `state.json` matching a glob, replaces every
 * occurrence of `<old-prefix>` with `<new-prefix>`, and writes the file
 * back. Idempotent: a second run reports `changed=0`.
 *
 * Usage:
 *   deno run -A scripts/migrate-state-paths.ts \
 *       <old-prefix> <new-prefix> [<glob>]
 *
 * Default glob covers BOTH the new layout (`<workflow>/runs/`) and the
 * legacy top-level (`runs/`).
 */

/** Pure rewriter — exposed for testing. Returns the rewritten text and
 * a flag indicating whether any replacement occurred. */
export function rewriteStateText(
  text: string,
  oldPrefix: string,
  newPrefix: string,
): { text: string; changed: boolean } {
  if (oldPrefix === newPrefix) return { text, changed: false };
  if (!text.includes(oldPrefix)) return { text, changed: false };
  // Use split+join to avoid regex escaping concerns.
  const rewritten = text.split(oldPrefix).join(newPrefix);
  return { text: rewritten, changed: rewritten !== text };
}

/** Default candidate paths walked when the user omits the glob argument. */
export const DEFAULT_GLOB_ROOTS: string[] = [
  ".flowai-workflow",
];

async function* walkStateFiles(
  root: string,
): AsyncGenerator<string> {
  let entries: AsyncIterable<Deno.DirEntry>;
  try {
    entries = Deno.readDir(root);
  } catch {
    return;
  }
  for await (const entry of entries) {
    const path = `${root}/${entry.name}`;
    if (entry.isDirectory) {
      yield* walkStateFiles(path);
    } else if (entry.isFile && entry.name === "state.json") {
      yield path;
    }
  }
}

interface MigrateResult {
  scanned: number;
  changed: string[];
}

/** Programmatic entry — returns counts so callers (and tests) can assert. */
export async function migrate(
  oldPrefix: string,
  newPrefix: string,
  roots: string[] = DEFAULT_GLOB_ROOTS,
): Promise<MigrateResult> {
  const result: MigrateResult = { scanned: 0, changed: [] };
  for (const root of roots) {
    for await (const path of walkStateFiles(root)) {
      result.scanned++;
      const text = await Deno.readTextFile(path);
      const { text: rewritten, changed } = rewriteStateText(
        text,
        oldPrefix,
        newPrefix,
      );
      if (changed) {
        await Deno.writeTextFile(path, rewritten);
        result.changed.push(path);
      }
    }
  }
  return result;
}

/** Render the CLI help text for the `migrate-state-paths` script. */
export function printUsage(): string {
  return `migrate-state-paths — rewrite legacy state.json paths in-place

Usage:
  deno run -A scripts/migrate-state-paths.ts <old-prefix> <new-prefix> [<root>...]

Idempotent: a second run reports changed=0.

Examples:
  # Move flat .flowai-workflow/ runs/ into a named subfolder layout:
  deno run -A scripts/migrate-state-paths.ts \\
      .flowai-workflow .flowai-workflow/default
`;
}

if (import.meta.main) {
  const args = Deno.args;
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log(printUsage());
    Deno.exit(0);
  }
  if (args.length < 2) {
    console.error("Error: <old-prefix> and <new-prefix> are required");
    console.error(printUsage());
    Deno.exit(2);
  }
  const [oldPrefix, newPrefix, ...rest] = args;
  const roots = rest.length > 0 ? rest : DEFAULT_GLOB_ROOTS;
  const r = await migrate(oldPrefix, newPrefix, roots);
  console.log(`scanned=${r.scanned} changed=${r.changed.length}`);
  for (const p of r.changed) console.log(`  changed: ${p}`);
  Deno.exit(0);
}
