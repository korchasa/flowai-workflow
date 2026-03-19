---
variant: "Variant A: Inline check in existing validateNode() loop block"
tasks:
  - desc: "Add forwarding validation in validateNode() loop branch"
    files: ["engine/config.ts"]
  - desc: "Add 4 test cases for loop input forwarding validation"
    files: ["engine/config_test.ts"]
  - desc: "Update SDS with forwarding validation design"
    files: ["documents/design-engine.md"]
---

## Justification

I selected Variant A for the following reasons:

1. **Minimal blast radius (~15 lines).** The check inserts directly after the
   existing body node validation loop in `validateNode()` (~line 261-271 in
   `config.ts`). No new exported functions, no signature changes, no new public
   surface area.

2. **Co-location with existing context.** The loop-type branch of
   `validateNode()` already has: the loop `node` object (so `node.inputs` gives
   the loop's declared inputs), the `bodyNodeIds` set (sibling body nodes), and
   the validation context for each body node's `inputs`. Adding the forwarding
   check here is a natural extension of the existing loop body validation —
   same data, same scope, same error-reporting pattern.

3. **Alignment with project vision (AGENTS.md).** The engine is a
   domain-agnostic DAG executor — simplicity and minimal abstractions are key
   design principles. Variant B adds unnecessary indirection (separate function,
   two-phase acceptance with confusing error ordering). Variant C pollutes a
   general-purpose function's signature with a loop-specific concern. Variant A
   keeps the validation logic where it semantically belongs without expanding
   the module's API surface.

4. **No two-phase acceptance confusion.** Unlike Variant B where
   `validateNode()` accepts the input ID first and `validateLoopForwarding()`
   rejects it later, Variant A produces a single coherent error at the point
   where the body node's inputs are being validated.

## Task Descriptions

### Task 1: Add forwarding validation in `validateNode()` loop branch

In `engine/config.ts`, inside the loop-type branch of `validateNode()`, after
the existing body node validation loop (~line 261-271): iterate each body
node's `inputs` array. For each input that is NOT in `bodyNodeIds` (i.e., it
references an external/top-level node), verify it exists in `node.inputs ?? []`
(the enclosing loop node's declared inputs). If missing, throw a config error
with format including the body node ID, the loop node ID, and the missing
external input IDs.

### Task 2: Add 4 test cases for loop input forwarding validation

In `engine/config_test.ts`, add tests:
1. Body node references external input listed in loop `inputs` → passes.
2. Body node references external input NOT in loop `inputs` → throws with
   body/loop/missing IDs in error message.
3. Body node references sibling body node → no error (internal ref).
4. Body node with no external refs → no error.

### Task 3: Update SDS with forwarding validation design

In `documents/design-engine.md`, update §3.1 (`config.ts` module description)
and §5 (Logic) to document the forwarding validation mechanism, error format,
and algorithm.

## Summary

I selected Variant A (inline check in `validateNode()` loop branch) for FR-E35.
The rationale is minimal change, co-location with existing loop validation
context, and alignment with the engine's domain-agnostic simplicity principle.
3 tasks ordered by dependency: config.ts validation logic → tests → SDS update.
Branch `sdlc/issue-153` created with draft PR.
