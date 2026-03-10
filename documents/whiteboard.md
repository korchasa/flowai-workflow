# FR-21: Human-in-the-Loop (Agent-Initiated)

## Goal

Enable any pipeline agent to pause mid-task, ask a question to a human, and
resume with the answer — without breaking pipeline autonomy in the common case.
Business value: prevents hallucination/failure when agents face genuine
ambiguity; enables 1-min human input to save 30-min executor+QA rework cycles.

## Overview

### Context

- SRS: `documents/requirements.md` §3.21 (FR-21)
- SDS: `documents/design.md` §3.7, §4.1 HITL, §5 "HITL via AskUserQuestion Interception"
- RnD: `documents/rnd/human-in-the-loop.md` (experiments confirmed; all key questions resolved)
- Pipeline is fully autonomous — no agent can currently request human input mid-task
- `AskUserQuestion` is a built-in Claude Code tool; denied in `-p` mode but visible as structured
  JSON in `permission_denials` of the CLI JSON output
- Verified (see RnD): `--resume <session_id> -p "<answer>"` restores full context; agent
  correctly interprets answer. Cost: ~$0.08/roundtrip
- Engine must remain project-agnostic: zero GitHub/Slack-specific code in engine core;
  delivery/polling delegated to configurable pipeline scripts

### Current State

Engine (`agent.ts`, `engine.ts`, `types.ts`, `state.ts`):
- `ClaudeCliOutput` has no `permission_denials` field → engine cannot detect HITL requests
- `NodeStatus` has no `waiting` state → cannot persist HITL pause in `state.json`
- `PipelineDefaults` has no `hitl` config → no `ask_script`/`check_script`/`poll_interval`/`timeout`
- `NodeState` has no `question_json` field → question not persisted for recovery
- `engine.ts:executeAgentNode()` has no HITL detection or poll loop
- `waiting` nodes not handled on `--resume`

Pipeline scripts (`.sdlc/scripts/`):
- `hitl-ask.sh` — does not exist
- `hitl-check.sh` — does not exist

### Constraints

- Engine must contain zero GitHub/Slack/email-specific code (SRS §3.21 key constraint)
- No Claude API calls during human wait (poll must be cheap: `sleep` + shell script)
- `--resume` skip logic is state.json-based (no changes needed to core resume mechanism)
- HITL timeout → node `failed` → Meta-Agent triggered (existing `run_always` reused)
- Must pass `deno task check` after each change (TDD: RED → GREEN → REFACTOR)

## Definition of Done

- [x] `ClaudeCliOutput` type includes `permission_denials?: PermissionDenial[]`
- [x] `NodeStatus` includes `"waiting"` state
- [x] `NodeState` includes `question_json?: string` (session_id already exists)
- [x] `PipelineDefaults` includes `hitl?: HitlConfig` (`ask_script`, `check_script`,
      `poll_interval`, `timeout`, `bot_login`)
- [x] Engine detects `AskUserQuestion` in `permission_denials` after agent node completes
- [x] Engine saves `session_id`, `question_json`, status `waiting` to `state.json`
- [x] Engine invokes `ask_script` with `--repo`, `--issue`, `--run-id`, `--node-id`,
      `--question-json` args
- [x] Engine enters poll loop: `sleep(poll_interval)` → `check_script` → exit 0 = reply in stdout
- [x] On reply: engine resumes agent via `claude --resume <session_id> -p "<reply>"`
- [x] Configurable `poll_interval` (default 60s) and `timeout` (default 7200s) in `pipeline.yaml`
- [x] On timeout: node marked `failed`, Meta-Agent triggered (existing mechanism)
- [x] `deno task run --resume <run-id>` on pipeline with `waiting` node auto-enters poll loop
- [x] `hitl-ask.sh` renders question JSON → markdown with HTML marker, posts via `gh issue comment`
- [x] `hitl-check.sh` finds first non-bot comment after marker, outputs body (exit 0) or exit 1
- [x] `deno task check` passes
- [x] SRS §3.21 all `[ ]` ACs marked `[x]` with evidence

## Solution (Variant B: Extracted `hitl.ts` Module)

### Architecture sequence

```
executeAgentNode()
  → runAgent() → AgentResult{permission_denials?}
    → detectHitlRequest() → HitlQuestion found
      → markNodeWaiting(sessionId, questionJson) + saveState()
      → runHitlLoop(skipAsk=false)
          → ask_script (gh issue comment)
          → poll: sleep → check_script → reply? → invokeClaudeCli(--resume)
          → timeout → AgentResult{success:false}
  → resume (wasWaiting=true) → runHitlLoop(skipAsk=true)
      → skip ask_script → poll → resume agent
```

### Step 1 — RED: failing tests

**`hitl_test.ts`** (new):
- `detectHitlRequest()`: null when no `permission_denials`; null when no
  AskUserQuestion entry; `HitlQuestion` when AskUserQuestion present
- `runHitlLoop()`: ask invoked with correct args; poll exits on check exit-0;
  timeout returns failure; `skipAsk=true` skips ask invocation
- Tests use injected `scriptRunner` stub (see Step 5) — no real shell invocations

**`state_test.ts`** additions:
- `markNodeWaiting()`: sets status=`waiting`, `session_id`, `question_json`

**`agent_test.ts`** additions:
- `AgentResult.permission_denials` populated from `ClaudeCliOutput`

### Step 2 — types.ts

```typescript
export interface PermissionDenial {
  tool_name: string;
  tool_input: Record<string, unknown>;
}
// ClaudeCliOutput: add field
permission_denials?: PermissionDenial[];
// NodeStatus: add "waiting" to union
// NodeState: add field
question_json?: string;   // serialized HitlQuestion; set when status=waiting
// New interface:
export interface HitlConfig {
  ask_script: string;
  check_script: string;
  poll_interval: number;  // seconds between polls, default 60
  timeout: number;        // max wait seconds, default 7200
  bot_login?: string;     // login to exclude in hitl-check.sh
}
// PipelineDefaults: add field
hitl?: HitlConfig;
```

### Step 3 — state.ts

Add `markNodeWaiting()`:
```typescript
export function markNodeWaiting(
  state: RunState, nodeId: string,
  sessionId: string, questionJson: string,
): void {
  updateNodeState(state, nodeId, {
    status: "waiting", session_id: sessionId, question_json: questionJson,
  });
}
```

### Step 4 — agent.ts

- Add `permission_denials?: PermissionDenial[]` to `AgentResult` interface
- In `runAgent()` success return: include
  `permission_denials: result.output?.permission_denials`

### Step 5 — hitl.ts (new file)

Exports:
```typescript
export interface HitlQuestion {
  question: string; header?: string;
  options?: Array<{ label: string; description?: string }>;
  multiSelect?: boolean;
}
export interface HitlRunOptions {
  config: HitlConfig; nodeId: string; runId: string;
  args: Record<string,string>; env: Record<string,string>;
  sessionId: string; question: HitlQuestion;
  node: NodeConfig; ctx: TemplateContext; settings: Required<NodeSettings>;
  claudeArgs?: string[]; output?: OutputManager;
  /** Injected script runner — defaults to real shell; override in tests. */
  scriptRunner?: (path: string, args: string[]) => Promise<{exitCode: number; stdout: string}>;
}
export function detectHitlRequest(output: ClaudeCliOutput): HitlQuestion | null
export async function runHitlLoop(
  opts: HitlRunOptions, skipAsk?: boolean
): Promise<AgentResult>
```

`runHitlLoop` flow:
1. `!skipAsk` → invoke `ask_script` via shell with args:
   `--repo ${env.GITHUB_REPO||""} --issue ${args.issue||""} --run-id ${runId}`
   `--node-id ${nodeId} --question-json <JSON>`
2. Poll (`deadline = Date.now() + config.timeout * 1000`):
   - `output?.status(nodeId, "WAITING for human reply (${elapsed}s elapsed)")` — visible in terminal
   - `sleep(config.poll_interval * 1000)`
   - invoke `check_script` with `--repo --issue --run-id --node-id --bot-login`
   - exit 0 → read stdout as reply → break loop
   - exit 1 → no reply yet → continue
   - other exit → log warning + continue (transient error)
3. reply → `invokeClaudeCli({ resumeSessionId: sessionId, taskPrompt: reply, ... })`
   → return `AgentResult` from resumed invocation
4. deadline exceeded → `{ success: false, continuations: 0, error: "HITL timeout after Xs" }`

Internal `runScript(path, args): Promise<{exitCode, stdout}>` — shared by ask + check.

### Step 6 — engine.ts

**`executeNode()`** — capture status before overwrite:
```typescript
const wasWaiting = this.state.nodes[nodeId]?.status === "waiting";
markNodeStarted(this.state, nodeId);  // only sets status+started_at; preserves session_id+question_json
// in switch:
case "agent": success = await this.executeAgentNode(nodeId, node, wasWaiting);
```
Safety: `markNodeStarted()` only mutates `status` and `started_at` — `session_id` and `question_json`
survive on `NodeState`. Pre-capture of `wasWaiting` before `markNodeStarted()` is the only fix needed.

**`executeAgentNode(nodeId, node, wasWaiting=false)`** signature extended:

- **Normal path** (`!wasWaiting`): run `runAgent()` → call `detectHitlRequest(result.output)`:
  - question found → `markNodeWaiting()` + `saveState()` → `runHitlLoop(opts, false)`
  - no question → proceed as before
- **Resume path** (`wasWaiting`): read `nodeState.session_id` + `nodeState.question_json`
  → `runHitlLoop(opts, true /* skipAsk */)`
- Both paths: `!result.success` → `markNodeFailed()`; success → save log

If HITL detected but `defaults.hitl` absent: throw immediately — fail fast.

### Step 7 — config.ts

In `extractNodeSettings()`: destructure `hitl` out alongside `max_parallel` and
`claude_args` to prevent it leaking into per-node `NodeSettings`.
No schema validation needed — `hitl` is optional; missing = HITL disabled.

### Step 8 — hitl-ask.sh (`.sdlc/scripts/hitl-ask.sh`)

```bash
#!/usr/bin/env bash
set -euo pipefail
# Parse args: --repo --issue --run-id --node-id --question-json
# If REPO empty: REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
# Render via jq: header + blockquoted question + numbered options + HTML marker
# Marker line: <!-- hitl:<RUN_ID>:<NODE_ID> -->
# Post: gh issue comment "$ISSUE" --repo "$REPO" --body "$MARKDOWN"
```

Output markdown format:
```
**Agent `<node-id>` is waiting for your input**

> <question>

1. **<label>** — <description>

_Reply with a comment below._
<!-- hitl:<run-id>:<node-id> -->
```

### Step 9 — hitl-check.sh (`.sdlc/scripts/hitl-check.sh`)

```bash
#!/usr/bin/env bash
set -euo pipefail
# Parse: --repo --issue --run-id --node-id --bot-login
# MARKER="<!-- hitl:${RUN_ID}:${NODE_ID} -->"
# gh api "repos/${REPO}/issues/${ISSUE}/comments" --paginate \
#   | jq -s "add"  ← REQUIRED: --paginate emits one array per page; -s merges into single array
#   | jq: find marker comment → first subsequent where .user.login != BOT_LOGIN
# Found: echo body; exit 0   Not found: exit 1
```

### Step 10 — pipeline.yaml + pipeline-task.yaml

Add to `defaults`:
```yaml
defaults:
  hitl:
    ask_script: .sdlc/scripts/hitl-ask.sh
    check_script: .sdlc/scripts/hitl-check.sh
    poll_interval: 60
    timeout: 7200
    bot_login: "github-actions[bot]"
```

### Step 11 — GREEN + REFACTOR + CHECK

`deno task check` → fix all errors/warnings; confirm all tests pass.

### Step 12 — SRS + SDS update

Mark all FR-21 `[ ]` ACs `[x]` with `file.ts:line` evidence.
Update `design.md` §3.7 evidence refs.

### Execution order

1. `hitl_test.ts` + state/agent test additions (RED)
2. `types.ts`
3. `state.ts` (`markNodeWaiting`)
4. `agent.ts` (`permission_denials` in `AgentResult`)
5. `hitl.ts` (GREEN)
6. `engine.ts` (`wasWaiting` flag + HITL branch in `executeAgentNode`)
7. `config.ts` (`hitl` exclusion in `extractNodeSettings`)
8. `deno task check` — GREEN
9. `hitl-ask.sh` + `hitl-check.sh`
10. `pipeline.yaml` + `pipeline-task.yaml`
11. `deno task check` — final
12. `requirements.md` + `design.md` (evidence)
