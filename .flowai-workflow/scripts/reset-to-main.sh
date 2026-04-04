#!/usr/bin/env bash
set -euo pipefail

# reset-to-main.sh — Hard reset to latest origin/main before pipeline run.
# Ensures agents always load from main (prompts, pipeline config, memory).
# Destructive by design: discards uncommitted changes, force-switches branch.
# Called by self_runner.ts and cli.ts BEFORE engine starts.

# Auto-stash uncommitted changes to preserve developer work before reset.
if [ -n "$(git status --porcelain)" ]; then
  branch="$(git branch --show-current)"
  echo "Dirty working tree on branch: ${branch}"
  git diff --stat HEAD
  git diff --stat --cached
  git status --porcelain | awk '/^\?\?/ { print "Untracked: " $2 }'
  timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  git stash push --include-untracked -m "flowai-workflow pre_run: ${timestamp}"
  echo "Stashed: $(git stash list -1)"
  echo "To restore: git stash pop"
fi

git fetch origin main

# Discard any local state: uncommitted changes, merge-in-progress, etc.
git checkout -f main
git reset --hard origin/main
git clean -fd

echo "Reset to origin/main: $(git rev-parse --short HEAD)"
