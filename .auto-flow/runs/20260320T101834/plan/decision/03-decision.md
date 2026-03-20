---
variant: "Variant B: Shared validation function using template.ts knowledge"
tasks:
  - desc: "Add validateTemplateVars() in template.ts with unit tests"
    files: ["engine/template.ts", "engine/template_test.ts"]
  - desc: "Call validateTemplateVars() from validateNode() for before/after hooks with integration tests"
    files: ["engine/config.ts", "engine/config_test.ts"]
---

## Justification

I selected Variant B because it co-locates template validation with template
resolution in `engine/template.ts`, creating a single source of truth for
valid template prefixes. This directly supports the project vision (AGENTS.md):
the engine is a domain-agnostic DAG executor where validation must be
consistent with the interpolation context — having both `resolve()` and
`validateTemplateVars()` in the same module eliminates drift risk between what
the engine accepts at load time and what it resolves at runtime.

Variant A duplicates the template regex and prefix knowledge into `config.ts`,
creating a maintenance burden. Variant C duplicates node-scoping logic already
handled by `validateNode()`. Variant B avoids both by exporting a pure
validation function from the module that owns template semantics.

The config→template coupling is natural: `config.ts` already depends on
template semantics (prompt paths, file references). Adding one import for hook
validation follows the established pattern.

## Task Descriptions

### Task 1: Add `validateTemplateVars()` in `template.ts`

Add `validateTemplateVars(template: string, knownInputs: string[]): string[]`
exported function in `engine/template.ts`. Extracts all `{{...}}` patterns
from the input string. For each pattern, validates:
- Known prefixes: `input` (suffix must be in `knownInputs`), `env`, `args`,
  `loop` (only `loop.iteration`).
- Known direct keys: `run_dir`, `run_id`, `node_dir`.
- `file("...")` pattern: accepted as valid.
- Unknown prefix/key → error string describing the invalid variable.

Returns array of error descriptions (empty = valid). Pure function, no I/O.

Unit tests in `engine/template_test.ts`: valid patterns pass, invalid prefix
rejected, invalid `input.<unknown>` rejected, `file(...)` accepted, multiple
errors accumulated, empty string returns no errors.

### Task 2: Call from `config.ts` `validateNode()` for hooks

In `engine/config.ts` `validateNode()`, after existing type-specific checks:
import `validateTemplateVars` from `template.ts`. For `node.before` and
`node.after`, call `validateTemplateVars(hookCmd, allNodeIds)`. Format errors
with hook type (`before`/`after`) and node ID. Throw config error if any
errors found.

For loop body nodes: pass combined `[...allNodeIds, ...bodyNodeIds]` as
`knownInputs` (body nodes can reference both external and sibling nodes).

Integration tests in `engine/config_test.ts`: `parseConfig` rejects invalid
hook template variables, accepts valid ones, error message includes hook type
and node ID.

## Summary

I selected Variant B: shared validation function in `template.ts`. Rationale:
single source of truth for template prefix validity, zero drift risk with
`resolve()`, natural coupling (config already depends on template semantics).
2 tasks ordered by dependency. Branch `sdlc/issue-176` created, draft PR opened.
