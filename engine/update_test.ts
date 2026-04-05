import { assertEquals } from "@std/assert";
import {
  buildAssetName,
  checkForUpdate,
  compareSemver,
  detectPlatform,
  GITHUB_REPO,
  runUpdate,
  type RunUpdateOptions,
} from "./update.ts";

// --- compareSemver ---

Deno.test("compareSemver: equal versions return 0", () => {
  assertEquals(compareSemver("1.2.3", "1.2.3"), 0);
});

Deno.test("compareSemver: major greater returns 1", () => {
  assertEquals(compareSemver("2.0.0", "1.9.9"), 1);
});

Deno.test("compareSemver: major less returns -1", () => {
  assertEquals(compareSemver("1.0.0", "2.0.0"), -1);
});

Deno.test("compareSemver: minor greater returns 1", () => {
  assertEquals(compareSemver("1.3.0", "1.2.9"), 1);
});

Deno.test("compareSemver: patch greater returns 1", () => {
  assertEquals(compareSemver("1.2.4", "1.2.3"), 1);
});

Deno.test("compareSemver: strips leading v", () => {
  assertEquals(compareSemver("v1.2.3", "1.2.3"), 0);
});

// --- detectPlatform ---

Deno.test("detectPlatform: returns valid os and arch on supported platform", () => {
  const p = detectPlatform();
  // On macOS/Linux CI this should return a valid platform
  if (Deno.build.os === "darwin" || Deno.build.os === "linux") {
    assertEquals(p !== null, true);
    assertEquals(typeof p!.os, "string");
    assertEquals(typeof p!.arch, "string");
  }
});

// --- buildAssetName ---

Deno.test("buildAssetName: linux x86_64", () => {
  assertEquals(
    buildAssetName("linux", "x86_64"),
    "flowai-workflow-linux-x86_64",
  );
});

Deno.test("buildAssetName: darwin arm64", () => {
  assertEquals(
    buildAssetName("darwin", "arm64"),
    "flowai-workflow-darwin-arm64",
  );
});

// --- checkForUpdate ---

function mockFetchOk(
  tagName: string,
  assets: { name: string; browser_download_url: string }[],
) {
  return (_url: string | URL | Request, _init?: RequestInit) =>
    Promise.resolve(
      new Response(JSON.stringify({ tag_name: tagName, assets }), {
        status: 200,
      }),
    );
}

function mockFetchError() {
  return () => Promise.reject(new Error("network error"));
}

function mockFetch404() {
  return () => Promise.resolve(new Response("not found", { status: 404 }));
}

Deno.test("checkForUpdate: returns update when newer version available", async () => {
  const result = await checkForUpdate("0.1.0", {
    fetch: mockFetchOk("v0.2.0", [
      {
        name: "flowai-workflow-darwin-arm64",
        browser_download_url: "https://example.com/bin",
      },
    ]),
    platform: { os: "darwin", arch: "arm64" },
  });
  assertEquals(result?.updateAvailable, true);
  assertEquals(result?.latestVersion, "0.2.0");
  assertEquals(result?.downloadUrl, "https://example.com/bin");
});

Deno.test("checkForUpdate: returns no update when same version", async () => {
  const result = await checkForUpdate("0.2.0", {
    fetch: mockFetchOk("v0.2.0", [
      {
        name: "flowai-workflow-darwin-arm64",
        browser_download_url: "https://example.com/bin",
      },
    ]),
    platform: { os: "darwin", arch: "arm64" },
  });
  assertEquals(result?.updateAvailable, false);
});

Deno.test("checkForUpdate: returns no update when current is newer", async () => {
  const result = await checkForUpdate("0.3.0", {
    fetch: mockFetchOk("v0.2.0", [
      {
        name: "flowai-workflow-darwin-arm64",
        browser_download_url: "https://example.com/bin",
      },
    ]),
    platform: { os: "darwin", arch: "arm64" },
  });
  assertEquals(result?.updateAvailable, false);
});

Deno.test("checkForUpdate: returns null on network error (fail-open)", async () => {
  const result = await checkForUpdate("0.1.0", {
    fetch: mockFetchError(),
    platform: { os: "darwin", arch: "arm64" },
  });
  assertEquals(result, null);
});

Deno.test("checkForUpdate: returns null on 404 (fail-open)", async () => {
  const result = await checkForUpdate("0.1.0", {
    fetch: mockFetch404(),
    platform: { os: "darwin", arch: "arm64" },
  });
  assertEquals(result, null);
});

Deno.test("checkForUpdate: returns null when asset not found for platform", async () => {
  const result = await checkForUpdate("0.1.0", {
    fetch: mockFetchOk("v0.2.0", [
      {
        name: "flowai-workflow-linux-x86_64",
        browser_download_url: "https://example.com/bin",
      },
    ]),
    platform: { os: "darwin", arch: "arm64" },
  });
  assertEquals(result, null);
});

Deno.test("checkForUpdate: returns null on malformed JSON", async () => {
  const result = await checkForUpdate("0.1.0", {
    fetch: () => Promise.resolve(new Response("not json", { status: 200 })),
    platform: { os: "darwin", arch: "arm64" },
  });
  assertEquals(result, null);
});

Deno.test("checkForUpdate: returns null for dev version", async () => {
  const result = await checkForUpdate("dev", {
    fetch: mockFetchOk("v0.2.0", [
      {
        name: "flowai-workflow-darwin-arm64",
        browser_download_url: "https://example.com/bin",
      },
    ]),
    platform: { os: "darwin", arch: "arm64" },
  });
  assertEquals(result, null);
});

Deno.test("checkForUpdate: includes GITHUB_TOKEN header when available", async () => {
  let capturedHeaders: HeadersInit | undefined;
  const mockFetch = (url: string | URL | Request, init?: RequestInit) => {
    capturedHeaders = init?.headers;
    return mockFetchOk("v0.2.0", [
      {
        name: "flowai-workflow-darwin-arm64",
        browser_download_url: "https://example.com/bin",
      },
    ])(url, init);
  };
  await checkForUpdate("0.1.0", {
    fetch: mockFetch,
    platform: { os: "darwin", arch: "arm64" },
    githubToken: "ghp_test123",
  });
  const headers = new Headers(capturedHeaders);
  assertEquals(headers.get("Authorization"), "token ghp_test123");
});

// --- runUpdate ---

Deno.test("runUpdate: successful update flow", async () => {
  const written: { path: string; content: Uint8Array }[] = [];
  let renamed = false;
  let chmodDone = false;

  const opts: RunUpdateOptions = {
    execPath: "/usr/local/bin/flowai-workflow",
    downloadFn: (_url: string) => Promise.resolve(new Uint8Array([1, 2, 3])),
    writeFn: (path: string, content: Uint8Array) => {
      written.push({ path, content });
      return Promise.resolve();
    },
    chmodFn: (_path: string) => {
      chmodDone = true;
      return Promise.resolve();
    },
    renameFn: (_from: string, _to: string) => {
      renamed = true;
      return Promise.resolve();
    },
    removeFn: () => Promise.resolve(),
    accessCheckFn: (_path: string) => Promise.resolve(true),
  };

  const result = await runUpdate("https://example.com/bin", opts);
  assertEquals(result, true);
  assertEquals(written.length, 1);
  assertEquals(written[0].content, new Uint8Array([1, 2, 3]));
  assertEquals(chmodDone, true);
  assertEquals(renamed, true);
});

Deno.test("runUpdate: returns false on permission denied", async () => {
  const opts: RunUpdateOptions = {
    execPath: "/usr/local/bin/flowai-workflow",
    downloadFn: () => Promise.resolve(new Uint8Array()),
    writeFn: () => Promise.resolve(),
    chmodFn: () => Promise.resolve(),
    renameFn: () => Promise.resolve(),
    removeFn: () => Promise.resolve(),
    accessCheckFn: () => Promise.resolve(false),
  };

  const result = await runUpdate("https://example.com/bin", opts);
  assertEquals(result, false);
});

Deno.test("runUpdate: returns false on download error", async () => {
  const opts: RunUpdateOptions = {
    execPath: "/usr/local/bin/flowai-workflow",
    downloadFn: () => Promise.reject(new Error("download failed")),
    writeFn: () => Promise.resolve(),
    chmodFn: () => Promise.resolve(),
    renameFn: () => Promise.resolve(),
    removeFn: () => Promise.resolve(),
    accessCheckFn: () => Promise.resolve(true),
  };

  const result = await runUpdate("https://example.com/bin", opts);
  assertEquals(result, false);
});

// --- GITHUB_REPO constant ---

Deno.test("GITHUB_REPO is correct", () => {
  assertEquals(GITHUB_REPO, "korchasa/flowai-pipelines");
});
