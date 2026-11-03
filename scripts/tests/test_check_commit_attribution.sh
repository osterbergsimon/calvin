#!/usr/bin/env bash
# Tests for scripts/check-commit-attribution.sh.
#
# Builds throwaway git repositories with clean commits (including text and
# merge subjects that merely mention Claude), one commit per AI attribution
# pattern the checker must reject, and mixed ranges where only the offending
# commit may be reported.
set -u

SCRIPT_DIR=$(cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(cd -- "$SCRIPT_DIR/../.." && pwd)
CHECK="$REPO_ROOT/scripts/check-commit-attribution.sh"

if [ ! -x "$CHECK" ]; then
  echo "FAIL: $CHECK is missing or not executable" >&2
  exit 1
fi

TMPROOT=$(mktemp -d "${TMPDIR:-/tmp}/calvin-attribution-test.XXXXXX") || exit 1
cleanup() { rm -rf "$TMPROOT"; }
trap cleanup EXIT

PASS=0
FAIL=0

pass() { PASS=$((PASS + 1)); }
fail() { FAIL=$((FAIL + 1)); printf 'FAIL: %s\n' "$*" >&2; }

new_repo() {
  local dir
  dir=$(mktemp -d "$TMPROOT/repo.XXXXXX")
  git -C "$dir" init -q -b develop
  git -C "$dir" config user.name "Test User"
  git -C "$dir" config user.email "test@example.com"
  git -C "$dir" config commit.gpgsign false
  printf '%s\n' "$dir"
}

commit() {
  local dir=$1 msg=$2
  shift 2
  git -C "$dir" commit -q --allow-empty -m "$msg" "$@"
}

run_check() {
  local dir=$1 range=$2
  ( cd "$dir" && "$CHECK" "$range" 2>&1 )
}

assert_clean() {
  local name=$1 dir=$2 range=$3 out code
  out=$(run_check "$dir" "$range")
  code=$?
  if [ "$code" -ne 0 ]; then
    fail "$name: expected exit 0, got $code"
    printf '%s\n' "$out" >&2
    return
  fi
  pass
}

assert_flagged() {
  local name=$1 dir=$2 range=$3 expected_line=$4 out code sha subject
  sha=$(git -C "$dir" rev-parse --short HEAD)
  subject=$(git -C "$dir" log -1 --format=%s HEAD)
  out=$(run_check "$dir" "$range")
  code=$?
  if [ "$code" -ne 1 ]; then
    fail "$name: expected exit 1, got $code"
    printf '%s\n' "$out" >&2
    return
  fi
  if ! printf '%s\n' "$out" | grep -Fq -- "$sha"; then
    fail "$name: output does not name commit $sha"
    printf '%s\n' "$out" >&2
    return
  fi
  if ! printf '%s\n' "$out" | grep -Fq -- "$subject"; then
    fail "$name: output does not include subject '$subject'"
    printf '%s\n' "$out" >&2
    return
  fi
  if ! printf '%s\n' "$out" | grep -Fq -- "$expected_line"; then
    fail "$name: output does not include matching line '$expected_line'"
    printf '%s\n' "$out" >&2
    return
  fi
  pass
}

# One offending commit, message-only patterns.
check_message_case() {
  local name=$1 msg=$2 expected_line=$3 dir
  dir=$(new_repo)
  commit "$dir" "chore: base"
  git -C "$dir" tag base
  commit "$dir" "$msg"
  assert_flagged "$name" "$dir" "base..HEAD" "$expected_line"
}

# ---------------------------------------------------------------------------
# Clean commits and false positives.
# ---------------------------------------------------------------------------

clean_repo=$(new_repo)
commit "$clean_repo" "chore: base"
git -C "$clean_repo" tag base
commit "$clean_repo" "docs: point readers at CLAUDE.md"
commit "$clean_repo" "docs: explain when claude output needs a human review"

git -C "$clean_repo" checkout -q -b claude/cranky-taussig
commit "$clean_repo" "fix: a real fix from the branch"
git -C "$clean_repo" checkout -q develop
git -C "$clean_repo" merge -q --no-ff \
  -m "Merge branch 'claude/cranky-taussig' into develop" \
  claude/cranky-taussig
commit "$clean_repo" "Merge pull request #7 from someone/claude/cranky-taussig"

assert_clean "clean commits, CLAUDE.md, claude docs text and claude/ merge subjects" \
  "$clean_repo" "base..HEAD"

# The default range must be origin/develop..HEAD.
git -C "$clean_repo" update-ref refs/remotes/origin/develop base
default_out=$( cd "$clean_repo" && "$CHECK" 2>&1 )
default_code=$?
if [ "$default_code" -ne 0 ]; then
  fail "default range origin/develop..HEAD: expected exit 0, got $default_code"
  printf '%s\n' "$default_out" >&2
else
  pass
fi

# An empty range is not a failure.
empty_repo=$(new_repo)
commit "$empty_repo" "chore: base"
git -C "$empty_repo" tag base
assert_clean "empty commit range" "$empty_repo" "base..HEAD"

# ---------------------------------------------------------------------------
# Offending trailers and generated-by lines.
# ---------------------------------------------------------------------------

check_message_case "Co-Authored-By Claude" \
  $'feat: add thing\n\nCo-Authored-By: Claude <noreply@anthropic.com>' \
  "Co-Authored-By: Claude <noreply@anthropic.com>"

check_message_case "lowercase co-authored-by claude" \
  $'feat: add thing\n\nco-authored-by: claude <noreply@anthropic.com>' \
  "co-authored-by: claude <noreply@anthropic.com>"

check_message_case "Co-Authored-By Anthropic" \
  $'feat: add thing\n\nCo-Authored-By: Anthropic <noreply@anthropic.com>' \
  "Co-Authored-By: Anthropic <noreply@anthropic.com>"

check_message_case "Co-Authored-By Copilot" \
  $'feat: add thing\n\nCo-Authored-By: Copilot <copilot@github.com>' \
  "Co-Authored-By: Copilot <copilot@github.com>"

check_message_case "Co-Authored-By ChatGPT" \
  $'feat: add thing\n\nCo-Authored-By: ChatGPT <noreply@openai.com>' \
  "Co-Authored-By: ChatGPT <noreply@openai.com>"

check_message_case "Co-Authored-By OpenAI" \
  $'feat: add thing\n\nCo-Authored-By: OpenAI <noreply@openai.com>' \
  "Co-Authored-By: OpenAI <noreply@openai.com>"

check_message_case "Co-Authored-By Gemini" \
  $'feat: add thing\n\nCo-Authored-By: Gemini <gemini@google.com>' \
  "Co-Authored-By: Gemini <gemini@google.com>"

check_message_case "Co-Authored-By Cursor" \
  $'feat: add thing\n\nCo-Authored-By: Cursor <cursor@cursor.com>' \
  "Co-Authored-By: Cursor <cursor@cursor.com>"

check_message_case "Co-Authored-By Codex" \
  $'feat: add thing\n\nCo-Authored-By: Codex <codex@openai.com>' \
  "Co-Authored-By: Codex <codex@openai.com>"

check_message_case "Generated with Claude Code" \
  $'feat: add thing\n\nGenerated with [Claude Code]' \
  "Generated with [Claude Code]"

check_message_case "Generated by Claude" \
  $'feat: add thing\n\nGenerated by Claude' \
  "Generated by Claude"

check_message_case "robot generated" \
  $'feat: add thing\n\n\U0001F916 Generated with love' \
  $'\U0001F916 Generated with love'

check_message_case "Claude-Session trailer" \
  $'feat: add thing\n\nClaude-Session: 01JABCDEF' \
  "Claude-Session: 01JABCDEF"

# ---------------------------------------------------------------------------
# Offending author and committer emails.
# ---------------------------------------------------------------------------

check_email_case() {
  local name=$1 kind=$2 email=$3 expected_line=$4 dir
  dir=$(new_repo)
  commit "$dir" "chore: base"
  git -C "$dir" tag base
  if [ "$kind" = author ]; then
    GIT_AUTHOR_EMAIL="$email" GIT_COMMITTER_EMAIL="test@example.com" \
      git -C "$dir" commit -q --allow-empty -m "feat: add thing"
  else
    GIT_AUTHOR_EMAIL="test@example.com" GIT_COMMITTER_EMAIL="$email" \
      git -C "$dir" commit -q --allow-empty -m "feat: add thing"
  fi
  assert_flagged "$name" "$dir" "base..HEAD" "$expected_line"
}

check_email_case "author anthropic.com email" author "claude@anthropic.com" \
  "author email: claude@anthropic.com"
check_email_case "committer openai.com email" committer "bot@openai.com" \
  "committer email: bot@openai.com"

# ---------------------------------------------------------------------------
# Only the offending commit is reported in a mixed range.
# ---------------------------------------------------------------------------

mixed_repo=$(new_repo)
commit "$mixed_repo" "chore: base"
git -C "$mixed_repo" tag base
commit "$mixed_repo" "docs: point readers at CLAUDE.md"
clean_sha=$(git -C "$mixed_repo" rev-parse --short HEAD)
commit "$mixed_repo" $'feat: add thing\n\nCo-Authored-By: Claude <noreply@anthropic.com>'
dirty_sha=$(git -C "$mixed_repo" rev-parse --short HEAD)

mixed_out=$(run_check "$mixed_repo" "base..HEAD")
mixed_code=$?
if [ "$mixed_code" -ne 1 ]; then
  fail "mixed range: expected exit 1, got $mixed_code"
  printf '%s\n' "$mixed_out" >&2
elif ! printf '%s\n' "$mixed_out" | grep -Fq -- "$dirty_sha"; then
  fail "mixed range: output does not name offending commit $dirty_sha"
  printf '%s\n' "$mixed_out" >&2
elif printf '%s\n' "$mixed_out" | grep -Fq -- "$clean_sha"; then
  fail "mixed range: clean commit $clean_sha was reported"
  printf '%s\n' "$mixed_out" >&2
else
  pass
fi

# ---------------------------------------------------------------------------
# Summary.
# ---------------------------------------------------------------------------

echo
echo "check-commit-attribution: ${PASS} passed, ${FAIL} failed"
if [ "$FAIL" -ne 0 ]; then
  exit 1
fi
