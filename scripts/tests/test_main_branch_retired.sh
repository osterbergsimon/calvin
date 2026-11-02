#!/usr/bin/env bash
# main is release-only: it has no docker/docker-compose.yml, calvin.env.example
# or calvin-app.service, and no :latest image is published. Hosts set up before
# develop became the default still record GIT_BRANCH=main in
# /etc/default/calvin-update. Re-running setup (the documented one-time step)
# must then use develop, not crash on an old setup-common.sh fetched from main
# ("read_env_value: command not found") or install host files from main, and
# the image tag must stay :develop.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=helpers/assert.sh
. "$HERE/helpers/assert.sh"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
export LOG_FILE="$tmp/setup.log"
export CALVIN_DEFAULT_DIR="$tmp/etc-default" CALVIN_ETC_DIR="$tmp/etc-calvin"
mkdir -p "$CALVIN_DEFAULT_DIR" "$CALVIN_ETC_DIR"
printf 'GIT_REPO=https://github.com/osterbergsimon/calvin.git\nGIT_BRANCH=main\nREPO_DIR=/home/calvin/calvin\nCALVIN_MODE=prod\n' \
    > "$CALVIN_DEFAULT_DIR/calvin-update"
unset GIT_BRANCH

# 1. Recorded main -> develop.
out="$(bash -c '. "$1" --source-only; echo "BRANCH=$GIT_BRANCH"' _ "$HERE/../setup.sh" 2>&1)"
printf '%s\n' "$out" | grep -qx 'BRANCH=develop' || fail "recorded GIT_BRANCH=main not replaced by develop: $out"
pass "recorded main is replaced by develop"

# 2. Explicit main -> develop too (nothing on main is deployable).
out="$(GIT_BRANCH=main bash -c '. "$1" --source-only; echo "BRANCH=$GIT_BRANCH"' _ "$HERE/../setup.sh" 2>&1)"
printf '%s\n' "$out" | grep -qx 'BRANCH=develop' || fail "GIT_BRANCH=main not replaced by develop: $out"
printf '%s\n' "$out" | grep -qi 'release-only' || fail "no warning about main: $out"
pass "explicit main is replaced by develop, with a warning"

# 3. The piped one-liner fetches setup-common.sh from develop and runs it.
make_stub "$tmp/bin" curl "echo \"curl \$*\" >> '$tmp/curl.log'
while [ \$# -gt 0 ]; do [ \"\$1\" = -o ] && cp '$HERE/../setup-common.sh' \"\$2\"; shift; done"
mkdir -p "$tmp/cwd"
out="$(cd "$tmp/cwd" && PATH="$tmp/bin:$PATH" bash < "$HERE/../setup.sh" 2>&1)" || true
assert_contains "$tmp/curl.log" 'raw.githubusercontent.com/osterbergsimon/calvin/develop/scripts/setup-common.sh' "piped setup fetched setup-common.sh from another branch"
case "$out" in *"command not found"*) fail "piped setup crashed: $out";; esac
case "$out" in *"must be run as root"*) ;; *) fail "piped setup did not get as far as the root check: $out";; esac
pass "piped one-liner fetches setup-common.sh from develop"

# 4. No branch maps to the unpublished :latest image.
# shellcheck source=../setup.sh
. "$HERE/../setup.sh" --source-only
assert_eq develop "$(image_tag_for_branch main)"
printf 'CALVIN_IMAGE_TAG=latest\n' > "$CALVIN_ETC_DIR/.env"
sync_image_tag "$CALVIN_ETC_DIR/.env" main >/dev/null
assert_eq develop "$(read_env_value "$CALVIN_ETC_DIR/.env" CALVIN_IMAGE_TAG)"
pass "image tag stays :develop"
