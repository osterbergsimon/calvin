#!/usr/bin/env bash
# P3/P9: `setup.sh --refresh` re-installs every host file from the checkout
# (compose file, systemd units, sudo helpers + sudoers, openbox/X config, the
# display agent, update-calvin.sh itself) without apt, Docker or git. That is
# what update-calvin.sh runs, so updates no longer leave stale host files.
# update-calvin.sh is installed root-owned: it runs as root.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
# shellcheck source=helpers/assert.sh
. "$HERE/helpers/assert.sh"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
export LOG_FILE="$tmp/setup.log"
export CALVIN_ETC_DIR="$tmp/etc-calvin" CALVIN_BIN_DIR="$tmp/usr-local-bin"
export CALVIN_SYSTEMD_DIR="$tmp/systemd" CALVIN_DEFAULT_DIR="$tmp/etc-default"
export CALVIN_KIOSK_ENV_FILE="$tmp/etc-default/calvin-kiosk"
export CALVIN_KIOSK_DISPLAY_ENV_FILE="$tmp/etc-default/calvin-kiosk-display"
export CALVIN_SUDOERS_DIR="$tmp/sudoers.d" CALVIN_POLKIT_DIR="$tmp/polkit"
export CALVIN_HOME_OVERRIDE="$tmp/home"
mkdir -p "$tmp/home/calvin"
B="$tmp/bin"
make_stub "$B" chown "echo \"chown \$*\" >> '$tmp/calls.log'"
make_stub "$B" systemctl "echo \"systemctl \$*\" >> '$tmp/calls.log'"
make_stub "$B" docker "echo \"docker \$*\" >> '$tmp/calls.log'"
make_stub "$B" apt-get "echo \"apt-get \$*\" >> '$tmp/calls.log'"
make_stub "$B" git "echo \"git \$*\" >> '$tmp/calls.log'"
make_stub "$B" visudo "exit 0"
export CALVIN_VISUDO="$B/visudo"
PATH="$B:$PATH"

# shellcheck source=../setup.sh
. "$HERE/../setup.sh" --source-only
CALVIN_DIR="$REPO"; CALVIN_SOURCE_DIR="$REPO"; GIT_BRANCH=develop; SETUP_MODE=prod

# An older install: stale compose file, .env with a custom port and :latest.
mkdir -p "$CALVIN_ETC_DIR"
echo "stale" > "$CALVIN_ETC_DIR/docker-compose.yml"
printf 'CALVIN_PORT=8123\nCALVIN_IMAGE_TAG=latest\n' > "$CALVIN_ETC_DIR/.env"

refresh_host_files >/dev/null

cmp -s "$REPO/docker/docker-compose.yml" "$CALVIN_ETC_DIR/docker-compose.yml" || fail "compose file not refreshed"
assert_contains "$CALVIN_ETC_DIR/.env" '^CALVIN_PORT=8123$' ".env port lost"
assert_contains "$CALVIN_ETC_DIR/.env" '^CALVIN_IMAGE_TAG=develop$'
for u in calvin-app calvin-x calvin-kiosk calvin-display-agent; do
    cmp -s "$REPO/deploy/systemd/$u.service" "$CALVIN_SYSTEMD_DIR/$u.service" || fail "$u.service not refreshed"
done
for s in update-calvin.sh reboot-calvin.sh restart-calvin-services.sh calvin_display_agent.py; do
    assert_mode "$CALVIN_BIN_DIR/$s" 755
done
cmp -s "$REPO/scripts/update-calvin.sh" "$CALVIN_BIN_DIR/update-calvin.sh" || fail "update-calvin.sh not refreshed"
assert_not_contains "$tmp/calls.log" "chown calvin:calvin $CALVIN_BIN_DIR/update-calvin.sh" "update-calvin.sh handed to calvin"
assert_contains "$CALVIN_SUDOERS_DIR/calvin-reboot" '^calvin ALL=\(root\) NOPASSWD: /usr/local/bin/reboot-calvin.sh$'
assert_contains "$CALVIN_SUDOERS_DIR/calvin-restart" 'NOPASSWD: /usr/local/bin/restart-calvin-services.sh$'
assert_contains "$CALVIN_DEFAULT_DIR/calvin-update" '^GIT_BRANCH=develop$'
assert_contains "$CALVIN_KIOSK_ENV_FILE" '^CALVIN_BACKEND_URL=http://localhost:8123$'
assert_contains "$tmp/home/calvin/.config/openbox/autostart" 'unclutter'
# A fresh host resolves auto -> cog, so refresh seeds the cog rotation file. It
# follows CALVIN_DEFAULT_DIR like the other /etc/default files (CI runs unprivileged).
assert_contains "$CALVIN_DEFAULT_DIR/calvin-kiosk-cog" '^CALVIN_COG_ROTATION=0$'
assert_contains "$tmp/calls.log" 'systemctl daemon-reload'
assert_not_contains "$tmp/calls.log" '^(apt-get|git) ' "refresh touched apt or git"
pass "refresh re-installs all host files, root-owned updater, no apt/git"

# The CLI flag reaches refresh-only mode.
parse_args --refresh
assert_eq 1 "$REFRESH_ONLY"
pass "--refresh parsed"
