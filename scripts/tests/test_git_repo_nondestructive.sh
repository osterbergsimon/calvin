#!/usr/bin/env bash
# P6: re-running setup ran `git reset --hard origin/<branch>`, wiping the local
# edits the docs tell users to make. Now: fast-forward only, and a dirty tree or
# local commits are left alone with a warning.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=helpers/assert.sh
. "$HERE/helpers/assert.sh"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
export LOG_FILE="$tmp/setup.log"
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t
export GIT_CONFIG_GLOBAL=/dev/null
# Tests run unprivileged: `sudo -u <user> cmd` just runs cmd.
make_stub "$tmp/bin" sudo 'shift 2; exec "$@"'
PATH="$tmp/bin:$PATH"

# shellcheck source=../setup-common.sh
. "$HERE/../setup-common.sh"

git init -q -b develop "$tmp/origin"
echo v1 > "$tmp/origin/file"; git -C "$tmp/origin" add file; git -C "$tmp/origin" commit -qm v1
git clone -q "$tmp/origin" "$tmp/checkout"
git -C "$tmp/origin" commit -qm v2 --allow-empty
upstream_head="$(git -C "$tmp/origin" rev-parse HEAD)"

# 1. Clean tree: fast-forwarded.
ensure_git_repo "$tmp/origin" develop "$tmp/checkout" "$(id -un)" >/dev/null
assert_eq "$upstream_head" "$(git -C "$tmp/checkout" rev-parse HEAD)" "clean checkout not fast-forwarded"
pass "clean checkout fast-forwarded"

# 2. Dirty tree: edit survives, no update.
git -C "$tmp/origin" commit -qm v3 --allow-empty
echo "local edit" > "$tmp/checkout/file"
ensure_git_repo "$tmp/origin" develop "$tmp/checkout" "$(id -un)" >/dev/null
assert_eq "local edit" "$(cat "$tmp/checkout/file")" "local edit was wiped"
assert_contains "$LOG_FILE" 'local changes' "no warning about skipping a dirty tree"
pass "dirty checkout left alone"

# 3. Local commit that diverges: kept.
git -C "$tmp/checkout" commit -qam "my tweak"
mine="$(git -C "$tmp/checkout" rev-parse HEAD)"
ensure_git_repo "$tmp/origin" develop "$tmp/checkout" "$(id -un)" >/dev/null
assert_eq "$mine" "$(git -C "$tmp/checkout" rev-parse HEAD)" "local commit was discarded"
pass "diverged local commit kept"

# 4. Nothing in setup-common.sh does a hard reset any more.
assert_not_contains "$HERE/../setup-common.sh" 'reset --hard' "setup-common.sh still runs git reset --hard"
pass "no git reset --hard"
