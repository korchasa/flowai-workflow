---
name: flowai-workflow-init
description: >-
  Initialize a new flowai-workflow project. Analyzes the codebase to detect
  project settings, asks the user to confirm or adjust, then scaffolds
  the .flowai-workflow/ directory.
user-invocable: true
argument-hint: "[--template <name>] [--dry-run]"
---

# Initialize flowai-workflow Project

## Overview

Scaffold a `.flowai-workflow/` directory in the current project with workflow
config, agent definitions, memory files, and HITL scripts. The skill analyzes
the project to pre-fill settings, confirms them with the user, then runs
`flowai-workflow init` non-interactively.

## Instructions

### 1. Pre-check

- If `.flowai-workflow/` already exists, inform the user and STOP. Do not
  overwrite without explicit confirmation. If the user confirms re-init,
  they must remove the directory manually first.

### 2. Analyze the project

Read manifest files to detect:

- **PROJECT_NAME** — from `deno.json` → `name`, `package.json` → `name`,
  `go.mod` → module path basename, `Cargo.toml` → `[package] name`,
  `pyproject.toml` → `[project] name`. Fallback: current directory name.
- **DEFAULT_BRANCH** — run `git symbolic-ref refs/remotes/origin/HEAD`,
  extract branch name after `refs/remotes/origin/`. Fallback: `main`.
- **TEST_CMD** — from `deno.json` → `tasks.test`, `package.json` →
  `scripts.test`, or by presence of `Cargo.toml` (`cargo test`),
  `go.mod` (`go test ./...`), `pyproject.toml` (`pytest`).
- **LINT_CMD** — from `deno.json` → `tasks.check`, `package.json` →
  `scripts.lint`, or by presence of `Cargo.toml` (`cargo clippy`),
  `go.mod` (`go vet ./...`).

### 3. Confirm with user

Present detected values and ask the user to confirm or edit:

```
I detected the following project settings:

  PROJECT_NAME:    <detected>
  DEFAULT_BRANCH:  <detected>
  TEST_CMD:        <detected or empty>
  LINT_CMD:        <detected or empty>

Are these correct? If not, tell me what to change.
```

Wait for user response. Apply any corrections.

### 4. Run init

Write a temporary YAML answers file and run init:

```bash
cat > /tmp/flowai-init-answers.yaml << 'EOF'
PROJECT_NAME: "<value>"
DEFAULT_BRANCH: "<value>"
TEST_CMD: "<value>"
LINT_CMD: "<value>"
EOF

flowai-workflow init --answers /tmp/flowai-init-answers.yaml
rm /tmp/flowai-init-answers.yaml
```

Pass through any user-provided flags (`--template`, `--dry-run`,
`--allow-dirty`).

If init fails due to uncommitted changes, ask the user whether to pass
`--allow-dirty` or commit first, then retry.

### 5. Post-init guidance

After successful scaffold, tell the user:

1. Review agents in `.flowai-workflow/agents/agent-*.md` and adapt prompts
   to your project conventions.
2. Review `.flowai-workflow/workflow.yaml` for workflow structure.
3. Run `flowai-workflow run` to execute the first workflow.

## Available Templates

- `sdlc-claude` (default) — 6-agent SDLC workflow (PM → Architect →
  Tech Lead → Developer/QA loop → Tech Lead Review)
