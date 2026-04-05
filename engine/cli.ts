#!/usr/bin/env -S deno run -A
/**
 * @module
 * CLI entry point for the workflow engine.
 * Parses arguments and delegates to {@link Engine}.
 * Usage: deno task run [options]
 *
 * Options:
 *   --config <path>       Workflow config file (default: .flowai-workflow/workflow.yaml)
 *   --prompt <text>       Additional context for PM agent (sets args.prompt)
 *   --resume <run-id>     Resume a previous run from its state
 *   --dry-run             Print execution plan without running
 *   -v, --verbose         Show full streaming output
 *   -s, --semi-verbose    Show text output only (suppress tool calls)
 *   -q, --quiet           Show errors only
 *   --env <KEY=VAL>       Set environment variable (repeatable)
 *   --skip <node-ids>     Comma-separated node IDs to skip
 *   --only <node-ids>     Comma-separated node IDs to run exclusively
 *   --version / -V        Print version and exit
 *   --update              Download and install latest version
 *   --skip-update-check   Skip update check on --version (for CI)
 */

import type { EngineOptions, Verbosity } from "./types.ts";
import { Engine } from "./engine.ts";
import { installSignalHandlers } from "./process-registry.ts";
import { checkForUpdate, runUpdate } from "./update.ts";

/** Version string embedded at compile time via VERSION env var. Defaults to "dev". */
export const VERSION = Deno.env.get("VERSION") ?? "dev";

/** Returns the formatted version string for `--version` output. */
export function getVersionString(): string {
  return `flowai-workflow v${VERSION}`;
}

/**
 * Parse CLI arguments into EngineOptions.
 * Known flags (--config, --resume, --dry-run, verbosity, --env, --skip, --only)
 * set dedicated fields. Generic `--key value` pairs populate `args`.
 */
export async function parseArgs(args: string[]): Promise<EngineOptions> {
  let configPath = ".flowai-workflow/workflow.yaml";
  let runId: string | undefined;
  let resume = false;
  let dryRun = false;
  let verbosity: Verbosity = "normal";
  const cliArgs: Record<string, string> = {};
  const envOverrides: Record<string, string> = {};
  let skipNodes: string[] | undefined;
  let onlyNodes: string[] | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case "--config":
        configPath = args[++i];
        break;
      case "--prompt":
        cliArgs.prompt = args[++i];
        break;
      case "--resume":
        resume = true;
        runId = args[++i];
        break;
      case "--dry-run":
        dryRun = true;
        break;
      case "-v":
      case "--verbose":
        verbosity = "verbose";
        break;
      case "-s":
      case "--semi-verbose":
        verbosity = "semi-verbose";
        break;
      case "-q":
      case "--quiet":
        verbosity = "quiet";
        break;
      case "--env": {
        const val = args[++i];
        const eqIdx = val.indexOf("=");
        if (eqIdx === -1) {
          throw new Error(`Invalid --env format: ${val}. Expected KEY=VALUE`);
        }
        envOverrides[val.substring(0, eqIdx)] = val.substring(eqIdx + 1);
        break;
      }
      case "--skip":
        skipNodes = args[++i].split(",").map((s) => s.trim());
        break;
      case "--only":
        onlyNodes = args[++i].split(",").map((s) => s.trim());
        break;
      case "--version":
      case "-V":
        await handleVersion();
        break;
      case "--update":
        await handleUpdate();
        break;
      case "--skip-update-check":
        // Consumed by handleVersion; no-op here
        break;
      case "--help":
      case "-h":
        printUsage();
        Deno.exit(0);
        break;
      default:
        if (arg.startsWith("--")) {
          // Treat as a generic arg: --key value
          const key = arg.substring(2);
          cliArgs[key] = args[++i] ?? "";
        } else {
          throw new Error(`Unknown argument: ${arg}`);
        }
    }
  }

  return {
    config_path: configPath,
    run_id: runId,
    resume,
    dry_run: dryRun,
    verbosity,
    args: cliArgs,
    env_overrides: envOverrides,
    skip_nodes: skipNodes,
    only_nodes: onlyNodes,
  };
}

async function handleVersion(): Promise<never> {
  console.log(getVersionString());
  if (VERSION !== "dev" && !Deno.args.includes("--skip-update-check")) {
    const result = await checkForUpdate(VERSION);
    if (result?.updateAvailable) {
      console.log(
        `\nUpdate available: ${result.currentVersion} → ${result.latestVersion}`,
      );
      console.log("Run: flowai-workflow --update");
    }
  }
  Deno.exit(0);
}

async function handleUpdate(): Promise<never> {
  if (VERSION === "dev") {
    console.error("Cannot update a dev build. Install a release binary first.");
    Deno.exit(1);
  }
  console.log(`Current version: ${VERSION}`);
  const result = await checkForUpdate(VERSION);
  if (!result) {
    console.log("Could not check for updates.");
    Deno.exit(1);
  }
  if (!result.updateAvailable) {
    console.log("Already up to date.");
    Deno.exit(0);
  }
  console.log(`Updating to ${result.latestVersion}...`);
  const success = await runUpdate(result.downloadUrl);
  Deno.exit(success ? 0 : 1);
}

function printUsage(): void {
  console.log(`
Workflow Engine — Configurable multi-agent workflow runner

Usage:
  deno task run [options]

Options:
  --config <path>       Workflow config file (default: .flowai-workflow/workflow.yaml)
  --prompt <text>       Additional context for PM agent (optional)
  --resume <run-id>     Resume a previous run
  --dry-run             Print execution plan without running
  -v, --verbose         Show full streaming output from agents
  -s, --semi-verbose    Show text output only (suppress tool calls)
  -q, --quiet           Show errors only
  --env <KEY=VAL>       Set environment variable (repeatable)
  --skip <node-ids>     Comma-separated node IDs to skip
  --only <node-ids>     Comma-separated node IDs to run exclusively
  -V, --version         Print version and exit (checks for updates)
  --update              Download and install latest version
  --skip-update-check   Skip update check on --version (for CI)
  -h, --help            Show this help

Examples:
  deno task run
  deno task run --prompt "Focus on the login bug"
  deno task run --config custom.yaml -v
  deno task run --resume 20260308T143022
  deno task run --dry-run
  deno task run --skip meta-agent --env DEBUG=true
`);
}

// --- Main ---

if (import.meta.main) {
  installSignalHandlers();

  try {
    const options = await parseArgs(Deno.args);

    // Load .env file if it exists
    try {
      const envFile = await Deno.readTextFile(".env");
      for (const line of envFile.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        const key = trimmed.substring(0, eqIdx).trim();
        const value = trimmed.substring(eqIdx + 1).trim().replace(
          /^['"]|['"]$/g,
          "",
        );
        // Don't override explicit --env values
        if (!(key in options.env_overrides)) {
          options.env_overrides[key] = value;
        }
      }
    } catch {
      // .env file is optional
    }

    const engine = new Engine(options);
    const state = await engine.run();

    // Exit with appropriate code
    Deno.exit(state.status === "completed" ? 0 : 1);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    Deno.exit(2);
  }
}
