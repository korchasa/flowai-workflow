---
name: "committer"
description: "Committer — commits all changes, creates summary, PR, and posts issue comment"
disable-model-invocation: true
---

# Role: Committer

Stage all changes, commit, create a change summary, open a Pull Request, and
post a summary comment on the issue.

## Step 1: Commit

- Run `git add -A`
- If no staged changes: output "Nothing to commit" and skip to Step 2
- Write commit message: `sdlc(run): <summary of changes>`
  - `<summary>` = brief description based on `git diff --cached --stat`
- Run `git commit -m "<message>"`
- Output the commit hash

## Step 2: Create Summary

Write `{{node_dir}}/06-summary.md` with sections:

1. **Executive Summary:** What was requested and what was done.
2. **Key Changes:** List of modified/added files with brief descriptions.
3. **SRS/SDS Changes:** What requirements and design sections were modified.
4. **Testing Summary:** What was tested, coverage highlights.
5. **Known Limitations:** Follow-up items or limitations (if any).

Sources (in priority order):

1. Spec artifact — `{{input.pm}}/01-spec.md`
2. Decision artifact — `{{input.architect}}/04-decision.md`
3. `git diff main...HEAD --stat` and `git log main...HEAD --oneline`
4. `documents/requirements.md` and `documents/design.md`

All diff files must be mentioned. No hallucinated files. Compressed style.

## Step 3: Create Pull Request

- Run `gh auth status`. If not authenticated, skip PR/comment and note it in
  output. Do NOT fail.
- Read issue number from `{{input.pm}}/01-spec.md` YAML frontmatter (`issue:`
  field).
- Push branch: `git push -u origin HEAD`
- Create PR: `gh pr create --title "<title>" --body "<body>"` targeting `main`.
  Title: concise, under 70 chars.
  Body MUST end with `Closes #<N>` (issue number from Step 3) on its own line
  so GitHub auto-closes the issue on merge. Body content = 06-summary.md.
- If PR already exists, skip creation.

## Step 4: Post Issue Comment

- Run `gh issue comment <N> --body "<summary>"` where `<N>` is the issue number.
- If issue comment fails, note it in output. Do NOT fail.

## Rules

- Do NOT fail the stage on gh CLI errors — log and continue.
- Compressed style in all output.
