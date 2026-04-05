/**
 * @module
 * Auto-update module for flowai-workflow CLI.
 * Checks GitHub Releases API for newer versions and performs self-update
 * by downloading the matching binary for the current platform.
 *
 * Design: fail-open — all errors return null/false, never blocking CLI.
 */

export const GITHUB_REPO = "korchasa/flowai-pipelines";
const RELEASES_API =
  `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const DEFAULT_TIMEOUT_MS = 5000;

/** Compare two semver strings (X.Y.Z). Returns -1, 0, or 1. */
export function compareSemver(a: string, b: string): number {
  const parse = (v: string) =>
    v.replace(/^v/, "").split(".").map(Number) as [number, number, number];
  const [aMaj, aMin, aPat] = parse(a);
  const [bMaj, bMin, bPat] = parse(b);
  if (aMaj !== bMaj) return aMaj > bMaj ? 1 : -1;
  if (aMin !== bMin) return aMin > bMin ? 1 : -1;
  if (aPat !== bPat) return aPat > bPat ? 1 : -1;
  return 0;
}

export interface Platform {
  os: "linux" | "darwin";
  arch: "x86_64" | "arm64";
}

/** Detect current platform from Deno.build. Returns null on unsupported. */
export function detectPlatform(): Platform | null {
  const osMap: Record<string, "linux" | "darwin"> = {
    linux: "linux",
    darwin: "darwin",
  };
  const archMap: Record<string, "x86_64" | "arm64"> = {
    x86_64: "x86_64",
    aarch64: "arm64",
  };
  const os = osMap[Deno.build.os];
  const arch = archMap[Deno.build.arch];
  if (!os || !arch) return null;
  return { os, arch };
}

/** Build the expected asset name matching compile.ts targets. */
export function buildAssetName(os: string, arch: string): string {
  return `flowai-workflow-${os}-${arch}`;
}

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  downloadUrl: string;
}

export interface CheckOptions {
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  platform?: Platform | null;
  githubToken?: string;
}

/**
 * Check GitHub Releases for a newer version.
 * Returns null on any error (fail-open).
 */
export async function checkForUpdate(
  currentVersion: string,
  options?: CheckOptions,
): Promise<UpdateCheckResult | null> {
  if (currentVersion === "dev") return null;

  const fetchFn = options?.fetch ?? globalThis.fetch;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const platform = options?.platform ?? detectPlatform();
  const githubToken = options?.githubToken ??
    Deno.env.get("GITHUB_TOKEN");

  if (!platform) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers: Record<string, string> = {
        Accept: "application/vnd.github.v3+json",
      };
      if (githubToken) {
        headers["Authorization"] = `token ${githubToken}`;
      }

      const response = await fetchFn(RELEASES_API, {
        signal: controller.signal,
        headers,
      });

      if (!response.ok) return null;

      const data = await response.json();
      const tagName = data?.tag_name;
      if (typeof tagName !== "string") return null;

      const latestVersion = tagName.replace(/^v/, "");
      const updateAvailable = compareSemver(latestVersion, currentVersion) > 0;

      const assetName = buildAssetName(platform.os, platform.arch);
      const asset =
        (data.assets as { name: string; browser_download_url: string }[])
          ?.find((a) => a.name === assetName);
      if (!asset) return null;

      return {
        currentVersion,
        latestVersion,
        updateAvailable,
        downloadUrl: asset.browser_download_url,
      };
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

export interface RunUpdateOptions {
  execPath?: string;
  downloadFn?: (url: string) => Promise<Uint8Array>;
  writeFn?: (path: string, content: Uint8Array) => Promise<void>;
  chmodFn?: (path: string) => Promise<void>;
  renameFn?: (from: string, to: string) => Promise<void>;
  removeFn?: (path: string) => Promise<void>;
  accessCheckFn?: (dir: string) => Promise<boolean>;
}

/**
 * Download and replace the current binary with a newer version.
 * Returns true on success, false on failure.
 */
export async function runUpdate(
  downloadUrl: string,
  options?: RunUpdateOptions,
): Promise<boolean> {
  const binaryPath = options?.execPath ?? Deno.execPath();
  const dir = binaryPath.substring(0, binaryPath.lastIndexOf("/"));
  const tmpPath = `${binaryPath}.update-tmp`;

  const accessCheck = options?.accessCheckFn ?? defaultAccessCheck;
  const download = options?.downloadFn ?? defaultDownload;
  const write = options?.writeFn ?? defaultWrite;
  const chmod = options?.chmodFn ?? defaultChmod;
  const rename = options?.renameFn ?? defaultRename;
  const remove = options?.removeFn ?? defaultRemove;

  try {
    const canWrite = await accessCheck(dir);
    if (!canWrite) {
      console.error(
        `Permission denied: cannot write to ${dir}\nRun: sudo flowai-workflow --update`,
      );
      return false;
    }

    console.log(`Downloading update...`);
    const content = await download(downloadUrl);

    await write(tmpPath, content);
    await chmod(tmpPath);
    await rename(tmpPath, binaryPath);
    console.log("Update complete. Restart to use the new version.");
    return true;
  } catch (err) {
    console.error(`Update failed: ${(err as Error).message}`);
    try {
      await remove(tmpPath);
    } catch { /* ignore cleanup errors */ }
    return false;
  }
}

async function defaultAccessCheck(dir: string): Promise<boolean> {
  try {
    await Deno.permissions.query({ name: "write", path: dir });
    await Deno.stat(dir);
    // Try to actually test write access
    const testFile = `${dir}/.update-test-${Date.now()}`;
    await Deno.writeTextFile(testFile, "");
    await Deno.remove(testFile);
    return true;
  } catch {
    return false;
  }
}

async function defaultDownload(url: string): Promise<Uint8Array> {
  const resp = await fetch(url, {
    headers: { Accept: "application/octet-stream" },
  });
  if (!resp.ok) {
    throw new Error(`Download failed: HTTP ${resp.status}`);
  }
  return new Uint8Array(await resp.arrayBuffer());
}

async function defaultWrite(path: string, content: Uint8Array): Promise<void> {
  await Deno.writeFile(path, content);
}

async function defaultChmod(path: string): Promise<void> {
  if (Deno.build.os !== "windows") {
    await Deno.chmod(path, 0o755);
  }
}

async function defaultRename(from: string, to: string): Promise<void> {
  await Deno.rename(from, to);
}

async function defaultRemove(path: string): Promise<void> {
  await Deno.remove(path);
}
