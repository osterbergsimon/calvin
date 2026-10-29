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

# update-calvin.sh hands its REPO_DIR to the refresh.
grep -q 'CALVIN_DIR="\$REPO_DIR" bash "\$SETUP_SCRIPT" --refresh' "$HERE/../update-calvin.sh" \
    || fail "update-calvin.sh does not pass REPO_DIR to setup.sh --refresh"
pass "update-calvin.sh refreshes from its own checkout"
