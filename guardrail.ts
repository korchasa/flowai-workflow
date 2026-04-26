/**
 * @module
 * Worktree-isolation runtime guardrail (FR-E50).
 *
 * Pure detection logic for files modified by an agent in the **main repo
 * working tree** (outside its assigned worktree and outside the node's
 * `allowed_paths`). Symmetric to `scope-check.ts` (FR-E37), which guards the
 * inside-worktree side. Used by the engine's node dispatcher to detect leaks
 * after each agent run; if leaks are found, the engine rolls them back via
 * `git checkout` / `git clean` and fails the run.
 */

/**
 * Find paths newly modified outside the assigned `workDir` and outside
 * `allowedPaths` globs. Pure function — no I/O.
 *
 * Algorithm:
 * 1. Compute `newMods = after − before` (excludes pre-existing modifications).
 * 2. Filter out paths inside `workDir` (prefix `${workDir}/` — trailing-slash
 *    semantic to avoid sibling-directory false positives).
 * 3. Filter out paths matching any glob in `allowedPaths`.
 * 4. Remaining paths are leaks.
 *
 * Caller contract: skip invocation when `workDir === "."` (no worktree case),
 * since the workDir prefix filter degenerates to a no-op there. Behavior is
 * still deterministic if invoked — only the `allowedPaths` filter applies.
 *
 * @param before Snapshot of modified+untracked files before agent ran
 * @param after Snapshot of modified+untracked files after agent ran
 * @param workDir Repo-relative path of the assigned worktree (or `.`)
 * @param allowedPaths Glob patterns for outside-worktree paths the node may modify
 * @returns Leaked paths (may be empty)
 */
export function detectLeaks(
  before: Set<string>,
  after: Set<string>,
  workDir: string,
  allowedPaths: readonly string[],
): string[] {
  const workDirPrefix = `${workDir}/`;
  const leaks: string[] = [];
  for (const path of after) {
    if (before.has(path)) continue;
    if (path.startsWith(workDirPrefix)) continue;
    if (allowedPaths.some((pattern) => globMatch(pattern, path))) continue;
    leaks.push(path);
  }
  return leaks;
}

/**
 * Format a single-line leak report for the engine log.
 * Format: `"[guardrail] node=<id> leaked <N> file(s): <comma-list> (rolled back)"`.
 */
export function formatLeakMessage(
  nodeId: string,
  leaks: readonly string[],
): string {
  return `[guardrail] node=${nodeId} leaked ${leaks.length} file(s): ${
    leaks.join(", ")
  } (rolled back)`;
}

/**
 * Glob match supporting `**`, `*`, `?`. Mirrors `scope-check.ts::globMatch`.
 */
function globMatch(pattern: string, filePath: string): boolean {
  let regexStr = "";
  let i = 0;
  while (i < pattern.length) {
    if (
      pattern[i] === "*" && i + 1 < pattern.length &&
      pattern[i + 1] === "*"
    ) {
      regexStr += ".*";
      i += 2;
      if (i < pattern.length && pattern[i] === "/") i++;
    } else if (pattern[i] === "*") {
      regexStr += "[^/]*";
      i++;
    } else if (pattern[i] === "?") {
      regexStr += "[^/]";
      i++;
    } else {
      regexStr += pattern[i].replace(/[.+^${}()|[\]\\]/g, "\\$&");
      i++;
    }
  }
  return new RegExp(`^${regexStr}$`).test(filePath);
}
