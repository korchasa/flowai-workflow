---
variant: "Variant B: Deno compile script + matrix CI workflow"
tasks:
  - desc: "Add version constant to cli.ts with env-based embedding"
    files: ["engine/cli.ts", "engine/cli_test.ts"]
  - desc: "Create scripts/compile.ts for cross-platform deno compile"
    files: ["scripts/compile.ts", "deno.json"]
  - desc: "Create GitHub Actions release workflow with matrix strategy"
    files: [".github/workflows/release.yml"]
  - desc: "Add installation section to README"
    files: ["README.md"]
---

## Justification

I selected Variant B for these reasons:

1. **Aligns with project vision** (AGENTS.md: "Universal DAG-based engine for
   orchestrating AI agents"): standalone binary eliminates the Deno prerequisite,
   making the engine truly portable — users copy `.auto-flow/` + one binary.

2. **Matrix CI gives parallel builds** without ARM64 runner dependency risk
   (Variant C). Each platform target builds independently; total CI time ≈
   single-target time instead of 4× sequential (Variant A).

3. **Version embedding** (`--version` flag reading `VERSION` env at compile
   time) improves UX and is standard for CLI tools. Minimal code change to
   `cli.ts` — one constant + one arg check.

4. **Checksums deferred** (Variant C scope): straightforward to add later once
   the release pipeline is proven. Avoids over-engineering per AGENTS.md
   planning rules ("Proactive Resolution" + "Quality > quantity").

## Task Descriptions

### Task 1: Add version constant to cli.ts

Add `VERSION` constant derived from `Deno.env.get("VERSION") ?? "dev"`. Add
`--version` / `-V` flag to `parseArgs()` that prints version and exits.
Unit test: verify `--version` outputs expected format. `deno compile --env
VERSION=<tag>` injects at build time.

### Task 2: Create scripts/compile.ts

Deno script accepting `--target <triple>` for single-target mode or no args
for all 4 targets. Targets: `x86_64-unknown-linux-gnu`,
`aarch64-unknown-linux-gnu`, `x86_64-apple-darwin`, `aarch64-apple-darwin`.
Output naming: `auto-flow-<os>-<arch>`. Invokes `deno compile --target <t>
--env VERSION=<v> --output <name> engine/cli.ts` per target. Add `compile`
task to `deno.json`: `"compile": "deno run -A scripts/compile.ts"`.

### Task 3: Create GitHub Actions release workflow

`.github/workflows/release.yml` triggered on `v*` tag push. Matrix strategy
with 4 platform targets. Each job: checkout → setup Deno → run
`deno task compile --target <t>` → upload artifact. Final job: download all
artifacts → create GitHub Release (`GITHUB_REF_NAME` as tag) → attach binaries.

### Task 4: Add installation section to README

Per-platform download commands using `gh release download` or `curl`. Minimal
end-to-end usage example: download → chmod → `./auto-flow --config path
--version`. Prerequisites section updated to note binary alternative.

## Summary

I selected Variant B (matrix CI + version embedding). Rationale: parallel
builds, portable binary without Deno, version UX, no ARM64 runner risk.
4 tasks ordered by dependency. Branch `sdlc/issue-183` created with draft PR.
