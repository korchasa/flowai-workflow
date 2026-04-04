#!/usr/bin/env bash
# reset-to-main_test.sh — Tests for reset-to-main.sh auto-stash behavior.
# Tests FR-S41 acceptance criteria: dirty-tree stash, clean-tree silence,
# and post-stash reset to origin/main.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="${SCRIPT_DIR}/reset-to-main.sh"
PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# Setup: temp bare remote + isolated working repo.
BARE_DIR="$(mktemp -d)"
WORK_DIR="$(mktemp -d)"
cleanup() { rm -rf "${BARE_DIR}" "${WORK_DIR}"; }
trap cleanup EXIT

git init --bare "${BARE_DIR}" -q
git -C "${WORK_DIR}" init -q
git -C "${WORK_DIR}" config user.email "test@test.com"
git -C "${WORK_DIR}" config user.name "Test"
git -C "${WORK_DIR}" remote add origin "${BARE_DIR}"
echo "initial" > "${WORK_DIR}/base.txt"
git -C "${WORK_DIR}" add base.txt
git -C "${WORK_DIR}" commit -m "initial" -q
git -C "${WORK_DIR}" branch -M main
git -C "${WORK_DIR}" push origin main -q

# ── Test 1: Clean tree — no stash created, no stash output ──────────────────
cd "${WORK_DIR}"
OUTPUT="$(bash "${SCRIPT}" 2>&1)"
STASH_COUNT="$(git -C "${WORK_DIR}" stash list | wc -l | tr -d ' ')"
[ "${STASH_COUNT}" -eq 0 ] && pass "clean_tree_no_stash_created" || fail "clean_tree_no_stash_created"
echo "${OUTPUT}" | grep -q "Stashed:" && fail "clean_tree_no_stash_output" || pass "clean_tree_no_stash_output"

# ── Test 2: Dirty tree — stash created, output has branch + ref + restore ───
echo "staged change" >> "${WORK_DIR}/base.txt"
git -C "${WORK_DIR}" add base.txt
echo "untracked" > "${WORK_DIR}/new.txt"
cd "${WORK_DIR}"
OUTPUT="$(bash "${SCRIPT}" 2>&1)"
STASH_COUNT="$(git -C "${WORK_DIR}" stash list | wc -l | tr -d ' ')"
[ "${STASH_COUNT}" -ge 1 ] && pass "dirty_tree_stash_created" || fail "dirty_tree_stash_created"
echo "${OUTPUT}" | grep -q "Dirty working tree" && pass "dirty_tree_branch_label" || fail "dirty_tree_branch_label"
echo "${OUTPUT}" | grep -q "Stashed:" && pass "dirty_tree_stash_ref" || fail "dirty_tree_stash_ref"
echo "${OUTPUT}" | grep -q "git stash pop" && pass "dirty_tree_restore_cmd" || fail "dirty_tree_restore_cmd"

# ── Test 3: Post-stash reset — HEAD lands on origin/main ────────────────────
echo "ahead" > "${WORK_DIR}/ahead.txt"
git -C "${WORK_DIR}" add ahead.txt
git -C "${WORK_DIR}" commit -m "local ahead" -q
ORIGIN_HEAD="$(git -C "${WORK_DIR}" rev-parse origin/main)"
cd "${WORK_DIR}"
bash "${SCRIPT}" > /dev/null 2>&1
AFTER_HEAD="$(git -C "${WORK_DIR}" rev-parse HEAD)"
[ "${AFTER_HEAD}" = "${ORIGIN_HEAD}" ] && pass "post_reset_head_at_origin_main" || fail "post_reset_head_at_origin_main"

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"
[ "${FAIL}" -eq 0 ]
