#!/usr/bin/env bash
# Reject AI attribution carried by a commit range.
#
# Inspects every commit message (merge commits included), author email and
# committer email, and fails when a commit carries an AI co-author trailer, a
# "Generated ..." line, a Claude-Session trailer, or an AI vendor email domain.
# Ordinary mentions of Claude (CLAUDE.md, docs text, claude/... branch names in
# merge subjects) are deliberately not flagged.
#
# Usage:
#   scripts/check-commit-attribution.sh [<commit-range>]
#
# The range defaults to origin/develop..HEAD (fetch the base branch first).
# CI passes the pull request's base...head range.
#
# Exit status: 0 clean, 1 attribution found, 2 bad repository or range.
set -u

usage() {
  cat <<'EOF'
Usage: scripts/check-commit-attribution.sh [<commit-range>]

  <commit-range>  git range to inspect (default: origin/develop..HEAD)

Examples:
  scripts/check-commit-attribution.sh
  scripts/check-commit-attribution.sh origin/develop...HEAD
  scripts/check-commit-attribution.sh "$BASE_SHA...$HEAD_SHA"
EOF
}

case "${1:-}" in
  -h|--help)
    usage
    exit 0
    ;;
  -*)
    echo "error: unknown option: $1" >&2
    usage >&2
    exit 2
    ;;
esac

range=${1:-${COMMIT_RANGE:-origin/develop..HEAD}}

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "error: not inside a git repository" >&2
  exit 2
fi

if ! git rev-list --quiet "$range" 2>/dev/null; then
  echo "error: invalid commit range '$range'" >&2
  echo "       fetch the base branch first (e.g. git fetch origin develop)" >&2
  exit 2
fi

mapfile -t commits < <(git rev-list "$range")

if [ "${#commits[@]}" -eq 0 ]; then
  echo "check-commit-attribution: no commits in '$range' - nothing to check."
  exit 0
fi

# A trailer only counts when the line itself is a Co-Authored-By line.
message_pattern='^[[:space:]]*co-authored[- ]by[[:space:]]*:.*(claude|anthropic|noreply@anthropic\.com|copilot|chatgpt|openai|gemini|cursor|codex)|generated[[:space:]]+with[[:space:]]+\[?claude[[:space:]]+code\]?|generated[[:space:]]+by[[:space:]]+claude|^[[:space:]]*claude-session[[:space:]]*:'
email_pattern='@(anthropic|openai)\.com$'
robot_pattern='🤖 Generated'

violations=0
report=""

for sha in "${commits[@]}"; do
  subject=$(git log -1 --format=%s "$sha")
  body=$(git log -1 --format=%B "$sha")
  author_email=$(git log -1 --format=%ae "$sha")
  committer_email=$(git log -1 --format=%ce "$sha")

  matches=""
  while IFS= read -r line; do
    if printf '%s\n' "$line" | grep -Eqi -- "$message_pattern"; then
      matches+="    ${line}"$'\n'
    elif printf '%s\n' "$line" | grep -Fqi -- "$robot_pattern"; then
      matches+="    ${line}"$'\n'
    fi
  done <<< "$body"

  if [ -n "$author_email" ] &&
    printf '%s\n' "$author_email" | grep -Eqi -- "$email_pattern"; then
    matches+="    author email: ${author_email}"$'\n'
  fi

  if [ -n "$committer_email" ] &&
    printf '%s\n' "$committer_email" | grep -Eqi -- "$email_pattern"; then
    matches+="    committer email: ${committer_email}"$'\n'
  fi

  if [ -n "$matches" ]; then
    violations=$((violations + 1))
    short=$(git rev-parse --short "$sha")
    report+="  ${short} ${subject}"$'\n'
    report+="$matches"
  fi
done

if [ "$violations" -gt 0 ]; then
  {
    printf 'error: AI attribution found in %d commit(s) in %s\n\n' \
      "$violations" "$range"
    printf '%s' "$report"
    cat <<'EOF'

Remove the offending trailer, generated-by line, or author/committer email
before opening or updating the pull request. Amend only commits on this
branch; do not rewrite shared history.
EOF
  } >&2
  exit 1
fi

printf 'check-commit-attribution: %d commit(s) in %s are clean.\n' \
  "${#commits[@]}" "$range"
exit 0
