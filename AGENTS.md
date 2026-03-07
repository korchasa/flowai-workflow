# YOU MUST

- STRICTLY FOLLOW YOUR ROLE.
- FIRST ACTION IN SESSION: READ ALL PROJECT DOCS. ONE-TIME PER SESSION.
- AFTER END OF SESSION, REVIEW ALL DOCUMENTS AND MAKE SURE THEY ARE ACCURATE AND
  UP TO DATE.
- ALWAYS CHECK THE CHANGES MADE BY RUNNING THE APPROPRIATE TESTS OR SCRIPTS.
- ALWAYS KEEP THE PROJECT IN WORKING CONDITION: WITHOUT ERRORS, WARNINGS, AND
  PROBLEMS IN THE FORMATER AND LINTER OUTPUT
- STRICTLY FOLLOW TDD RULES.
- WRITE ALL DOCUMENTATION IN ENGLISH IN COMPRESSED STYLE.
- IF YOU SEE CONTRADICTIONS IN THE REQUEST OR CONTEXT, SAY ABOUT THEM, ASK THE
  NECESSARY QUESTIONS AND STOP.
- DO NOT USE STUBS, "CRUTCHES", DECEPTIONS, OR OTHER PREMODS TO BYPASS CHECKS.
- THE CODE MUST FOLLOW THE "FAIL FAST, FAIL CLEARLY" STRATEGY UNLESS THE USER
  HAS REQUESTED OTHERWISE.
- IF A FIX ATTEMPT FAILS, APPLY "5 WHY" ANALYSIS TO FIND THE ROOT CAUSE BEFORE
  RETRYING.
- IF ROOT CAUSE IS UNFIXABLE OR OUTSIDE CONTROL: STOP. DO NOT USE WORKAROUNDS.
  ASK USER FOR HELP.
- IF ISSUE PERSISTS AFTER 2 ATTEMPTS: STOP. OUTPUT "STOP-ANALYSIS REPORT"
  (STATE, EXPECTED, 5-WHY CHAIN, ROOT CAUSE, HYPOTHESES). WAIT FOR USER HELP.
- WHEN EDITING CI/CD, ALWAYS CHECK LOCALLY FIRST.
- BE PRECISE IN YOUR WORDING. USE A SCIENTIFIC APPROACH. ACCOMPANY HIGHLY
  SPECIALIZED TERMS AND ABBREVIATIONS WITH SHORT HINTS IN PARENTHESES
- PROVIDE EVIDENCE FOR YOUR CLAIMS
- USE STANDARD TOOLS (jq, yq, jc) TO PROCESS AND MANAGE OUTPUT.
- DO NOT USE TABLES IN CHAT OUTPUT. USE TWO-LEVEL LIST INSTEAD.

---

## Project Information

- Project Name: auto-flow

## Project Vision

Automate the full software development lifecycle for feature requests: from
GitHub Issue triage to merged, tested code — fully autonomous, no human gates
between stages. A CI/CD-integrated system where a GitHub Issue triggers a chain
of specialized AI agents (Claude Code CLI), each performing a distinct role (PM,
Tech Lead, Architect, Executor, QA, Presenter, Meta-Agent).

## Project tooling Stack

- Deno (scripting, utilities, validation, task runner)
- Shell/Bash (stage orchestration scripts)
- Docker (single runtime image for all stages)
- GitHub Actions (CI/CD pipeline trigger and execution)
- Claude Code CLI (`claude`) (AI agent runtime)
- `gh` CLI (GitHub API interaction: PRs, issue comments)
- Git (version control, branch management, diff-based safety checks)

## Architecture

- **Pattern:** Multi-agent pipeline with sequential stages and iterative loops
- **Stage orchestration:** Shell scripts in `.sdlc/scripts/` invoke `claude` CLI
  with role-specific prompts from `.sdlc/agents/`
- **Inter-agent communication:** Structured Markdown artifacts in
  `.sdlc/pipeline/<issue-number>/`
- **Continuation mechanism:** `--resume` flag for re-invoking agents within same
  session on validation failure
- **Executor+QA loop:** Iterative implementation/verification cycle (max 3
  iterations)
- **Meta-Agent:** Post-run analysis agent for prompt optimization (runs on both
  success and failure)
- **Docker image:** Single image with claude CLI, deno, git, gh — all stages use
  same image

## Key Decisions

- Single Docker image for all stages (simplicity, consistency)
- Agents are stateless — all context from file artifacts and system prompts
- Pipeline is project-agnostic (designed for any repo, not just news-digester)
- Meta-Agent suggests prompt improvements but does NOT auto-modify prompts
- Diff-based safety checks in Executor stage (prevent scope creep, secret leaks)
- Shell scripts handle orchestration; Deno for validation/utilities
- Artifacts overwritten on re-run; git history preserves previous versions

## Planning Rules

- **Environment Side-Effects**: Changes to infra/DB/external services -> plan
  MUST include migration/sync/deploy steps.
- **Verification Steps**: Plan MUST include specific verification commands
  (tests, validation tools, connectivity checks).
- **Functionality Preservation**: Refactoring/modifications -> run existing
  tests before/after; add new tests if coverage missing.
- **Data-First**: Integration with external APIs/processes -> inspect protocol &
  data formats BEFORE planning.
- **Architectural Validation**: Complex logic changes -> visualize event
  sequence (sequence diagram/pseudocode).
- **Variant Analysis**: Non-obvious path -> propose variants with Pros/Cons.
  Quality > quantity. 1 variant OK if path is clear.
- **User Decision Gate**: Do NOT detail implementation plan until user
  explicitly selects a variant.
- **Plan Persistence**: After variant selection, save the detailed plan to
  `documents/whiteboard.md` using GODS format. Chat-only plans are lost between
  sessions.
- **Proactive Resolution**: Before asking user, exhaust available resources
  (codebase, docs, web) to find the answer autonomously.

## CODE DOCS

- **Module**: `AGENTS.md` (responsibility/decisions).
- **Comments**: Class/Method/Func (JSDoc/GoDoc). Why/How > What. No trivial
  comments.

## TDD FLOW

1. **RED**: Write test (`test <id>`) for new/changed logic or behavior.
2. **GREEN**: Pass test (`test <id>`).
3. **REFACTOR**: Improve code/tests. No behavior change. (`test <id>`).
4. **CHECK**: `check` command. Fix all warnings and errors.

### Test Rules

- DO NOT test constants/templates. Test LOGIC/BEHAVIOR only.
- Tests in same pkg. Private methods OK.
- Code ONLY to fix tests/issues.
- NO STUBS. Real code.
- Run ALL tests before finish.
