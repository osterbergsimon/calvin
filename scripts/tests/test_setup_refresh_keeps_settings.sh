#!/usr/bin/env bash
# A refresh (run by every update) must keep the host's own settings: a data dir
# set at install time stays in /etc/calvin/.env (rewriting it to the default
# would make the data look lost), and update-calvin.sh refreshes from the
# checkout recorded in /etc/default/calvin-update, not the default path.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=helpers/assert.sh
. "$HERE/helpers/assert.sh"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
export LOG_FILE="$tmp/setup.log"
export CALVIN_ETC_DIR="$tmp/etc-calvin" CALVIN_DEFAULT_DIR="$tmp/etc-default"
mkdir -p "$CALVIN_ETC_DIR" "$CALVIN_DEFAULT_DIR"
printf 'CALVIN_DATA_DIR=/srv/calvin-data\nCALVIN_PORT=8000\n' > "$CALVIN_ETC_DIR/.env"
printf 'GIT_BRANCH=develop\nREPO_DIR=/opt/calvin\nCALVIN_MODE=prod\n' > "$CALVIN_DEFAULT_DIR/calvin-update"
unset CALVIN_DATA_DIR CALVIN_DIR

# shellcheck source=../setup.sh
. "$HERE/../setup.sh" --source-only
assert_eq /srv/calvin-data "$CALVIN_DATA_DIR" "refresh would reset the data dir to the default"
assert_eq /opt/calvin "$CALVIN_DIR" "setup ignores the checkout recorded in calvin-update"
pass "setup.sh keeps the installed data dir and checkout"

# Host files are installed from a root-owned clone of GIT_REPO/GIT_BRANCH, not
# from the calvin-owned checkout (root must not install what the app user edits).
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t GIT_CONFIG_GLOBAL=/dev/null
git init -q -b develop "$tmp/origin"; echo ok > "$tmp/origin/marker"
git -C "$tmp/origin" add -A; git -C "$tmp/origin" commit -qm v1
export CALVIN_UPDATE_DIR="$tmp/update-root"
src="$(prepare_source_snapshot "$tmp/origin" develop)"
assert_eq "$tmp/update-root/src" "$src"
assert_eq ok "$(cat "$src/marker")"
assert_mode "$tmp/update-root" 700
pass "host files come from a root-only clone of the configured branch"

# The state dir must not be one the app user could have pre-created.
rm -rf "$tmp/update-root"; mkdir -m 0777 "$tmp/update-root"
if (prepare_source_snapshot "$tmp/origin" develop) >/dev/null 2>&1; then
    fail "used a world-writable update dir"
fi
pass "refuses an update dir others can write"

# create_update_config keeps operator keys (it used to rewrite the file).
printf 'WAIT_TIMEOUT=600\nGIT_BRANCH=old\n' > "$CALVIN_DEFAULT_DIR/calvin-update"
create_update_config https://example/calvin.git develop /opt/calvin prod >/dev/null
assert_contains "$CALVIN_DEFAULT_DIR/calvin-update" '^WAIT_TIMEOUT=600$' "operator key dropped"
assert_contains "$CALVIN_DEFAULT_DIR/calvin-update" '^GIT_BRANCH=develop$'
pass "create_update_config upserts"

# setup.sh never sources a setup-common.sh from the current directory.
mkdir -p "$tmp/cwd"; printf 'echo PLANTED; exit 7\n' > "$tmp/cwd/setup-common.sh"
out="$(cd "$tmp/cwd" && bash "$HERE/../setup.sh" --help 2>&1)" || fail "setup.sh --help failed: $out"
case "$out" in *PLANTED*) fail "setup.sh sourced ./setup-common.sh from the current directory";; esac
pass "setup-common.sh comes from the script's own directory"
