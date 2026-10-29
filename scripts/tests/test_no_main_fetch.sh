#!/usr/bin/env bash
# P1: the README's install one-liners fetched setup.sh from `main`, which is
# release-only and hundreds of commits behind develop, so new users installed
# old code. Install commands and script defaults must not point at main.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
# shellcheck source=helpers/assert.sh
. "$HERE/helpers/assert.sh"

# raw.githubusercontent.com/<owner>/calvin/main/scripts/... anywhere in the docs.
hits="$(grep -rnE --exclude-dir=tests 'raw\.githubusercontent\.com/[^/]+/calvin/main/scripts/' \
    "$REPO/README.md" "$REPO/docs" "$REPO/scripts" "$REPO/deploy" \
    --include='*.md' --include='*.sh' 2>/dev/null | grep -v '/docs/superpowers/' || true)"
[ -z "$hits" ] || fail "install commands still fetch from main:
$hits"
pass "no install command fetches scripts from main"

# Script defaults.
assert_contains "$REPO/scripts/setup-common.sh" '^readonly DEFAULT_GIT_BRANCH="develop"$' "setup-common.sh defaults to main"
assert_not_contains "$REPO/scripts/setup.sh" 'GIT_BRANCH:-main' "setup.sh falls back to main"
assert_not_contains "$REPO/scripts/update-calvin.sh" 'GIT_BRANCH:-main' "update-calvin.sh falls back to main"
assert_not_contains "$REPO/scripts/setup-dev.sh" 'GIT_BRANCH:-main' "setup-dev.sh falls back to main"
pass "script defaults use develop"
