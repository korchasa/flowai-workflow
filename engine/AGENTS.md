# Engine Module

- Responsibility: domain-agnostic DAG executor for orchestrating AI agents.
  Reads YAML workflow configs, resolves node dependencies, executes nodes in
  topological order, handles continuation/resume/HITL.
- Scope: core engine only. MUST NOT contain git, GitHub, branch, PR, or any
  domain-specific logic. All domain workflows are implemented via agent nodes
  in workflow YAML configs.
- Key modules:
  - `cli.ts` — CLI entry point, argument parsing, run/resume dispatch.
  - `config.ts` — YAML config loading, schema validation, default merging.
  - `dag.ts` — DAG construction, topological sort, level assignment.
  - `engine.ts` — main orchestrator: level execution, node dispatch, summary.
  - `agent.ts` — agent node executor: runtime invocation, continuation loop.
  - `loop.ts` — loop node executor: iterative body with exit condition.
  - `human.ts` — human node executor: terminal prompt for HITL input.
  - `node-dispatch.ts` — routes node type to corresponding executor.
  - `state.ts` — run state persistence (state.json), node status tracking.
  - `template.ts` — `{{input.<node-id>}}` interpolation in prompts/args.
  - `validate.ts` — pre-run validation of workflow config and node graph.
  - `hitl.ts`, `hitl-handler.ts` — human-in-the-loop permission handling.
  - `lock.ts` — run lock file to prevent concurrent executions.
  - `stream.ts` — streaming output parsing from agent runtimes.
  - `log.ts`, `output.ts` — logging and verbosity control.
  - `process-registry.ts` — child process tracking and signal handling.
  - `runtime/` — runtime abstraction layer (claude, opencode adapters).
  - `worktree.ts` — git worktree isolation for agent execution.
  - `scope-check.ts` — uncommitted changes safety check.
  - `post-workflow.ts` — post-run cleanup and summary.
- Key decisions:
  - Engine is workflow-independent: one engine, many workflows.
  - Nodes execute sequentially within levels (parallel deferred).
  - Artifacts stored per-run in `<runs-dir>/<run-id>/<node-id>/`.
  - Failed runs resumable via `--resume <run-id>`.
  - Continuation re-invokes agents on validation failure (max N per node).
