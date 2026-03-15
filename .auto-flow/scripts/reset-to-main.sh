#!/usr/bin/env bash
set -euo pipefail

# reset-to-main.sh — Hard reset to latest origin/main before pipeline run.
# Ensures agents always load from main (prompts, pipeline config, memory).
# Destructive by design: discards uncommitted changes, force-switches branch.
# Called by self_runner.ts and cli.ts BEFORE engine starts.

git fetch origin main

# Discard any local state: uncommitted changes, merge-in-progress, etc.
git checkout -f main
git reset --hard origin/main
git clean -fd

echo "Reset to origin/main: $(git rev-parse --short HEAD)"
