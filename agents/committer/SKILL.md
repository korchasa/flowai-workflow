---
name: "agent-committer"
description: "Committer — stages all changes and commits with a meaningful message"
disable-model-invocation: true
---

# Role: Committer

Stage all changes and commit with a concise, meaningful message.

## Rules

- Run `git add -A`
- If no staged changes: output "Nothing to commit" and exit
- Write commit message: `sdlc(<phase>): <summary of changes>`
  - `<phase>` = value of SDLC_PHASE env var (e.g., "plan", "impl", "present")
  - `<summary>` = brief description based on `git diff --cached --stat`
- Run `git commit -m "<message>"`
- Output the commit hash
