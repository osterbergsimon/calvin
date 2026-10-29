#!/usr/bin/env bash
# setup.sh host configuration:
#   P6  data dirs get 0750 and lose world access (chmod -R 755 made the DB
#       world-readable)
#   P8  the image tag is :develop (no :latest is published; main is
#       release-only) without overriding an operator's pin; CALVIN_IMAGE_TAG=latest left by an old
#       .env is migrated (calvin-u1r)
#   P4  the display agent is installed on all-in-one Pis too, pointed at
#       localhost:CALVIN_PORT, and keeps operator settings in its env file
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
# shellcheck source=helpers/assert.sh
. "$HERE/helpers/assert.sh"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
export LOG_FILE="$tmp/setup.log"
make_stub "$tmp/bin" chown ":"
make_stub "$tmp/bin" systemctl "echo \"\$*\" >> '$tmp/systemctl.log'"
PATH="$tmp/bin:$PATH"

# shellcheck source=../setup.sh
. "$HERE/../setup.sh" --source-only

# --- P6: data dir modes ---------------------------------------------------
CALVIN_DATA_DIR="$tmp/data"
mkdir -p "$CALVIN_DATA_DIR/db"
echo db > "$CALVIN_DATA_DIR/db/calvin.db"; chmod 0755 "$CALVIN_DATA_DIR" "$CALVIN_DATA_DIR/db"
chmod 0644 "$CALVIN_DATA_DIR/db/calvin.db"
create_runtime_data_dirs >/dev/null
for d in "" /db /images /plugins /logs; do assert_mode "$CALVIN_DATA_DIR$d" 750; done
assert_mode "$CALVIN_DATA_DIR/db/calvin.db" 640
pass "data dirs 0750, no world access to the DB"

# --- P8: image tag follows the branch -------------------------------------
assert_eq develop "$(image_tag_for_branch main)"
assert_eq develop "$(image_tag_for_branch develop)"
assert_eq develop "$(image_tag_for_branch feature/x)"

env_file="$tmp/.env"
tag_after() {  # initial-line branch -> resulting CALVIN_IMAGE_TAG
    printf '%s\nCALVIN_PORT=8000\n' "$1" > "$env_file"
    sync_image_tag "$env_file" "$2" >/dev/null
    read_env_value "$env_file" CALVIN_IMAGE_TAG
}
assert_eq develop "$(tag_after 'CALVIN_IMAGE_TAG=latest' develop)" "stale :latest not migrated to :develop"
assert_eq develop "$(tag_after '# no tag' develop)"
assert_eq develop "$(tag_after 'CALVIN_IMAGE_TAG=develop' main)" "main switched to the unpublished :latest"
assert_eq v1.2.3 "$(tag_after 'CALVIN_IMAGE_TAG=v1.2.3' develop)" "an operator pin was overwritten"
assert_eq sha-abc1234 "$(CALVIN_IMAGE_TAG=sha-abc1234 tag_after 'CALVIN_IMAGE_TAG=v1.2.3' develop)" "explicit CALVIN_IMAGE_TAG ignored"
assert_contains "$env_file" '^CALVIN_PORT=8000$'
pass "image tag follows the branch, pins kept"

# --- P4: display agent on all-in-one --------------------------------------
export CALVIN_BIN_DIR="$tmp/usr-local-bin" CALVIN_SYSTEMD_DIR="$tmp/systemd"
export CALVIN_KIOSK_ENV_FILE="$tmp/calvin-kiosk"
mkdir -p "$CALVIN_BIN_DIR" "$CALVIN_SYSTEMD_DIR"
printf 'CALVIN_DISPLAY_ROTATION=left\n' > "$CALVIN_KIOSK_ENV_FILE"
CALVIN_DIR="$REPO"; CALVIN_SOURCE_DIR="$REPO"
install_display_agent 8123 >/dev/null
assert_mode "$CALVIN_BIN_DIR/calvin_display_agent.py" 755
cmp -s "$REPO/deploy/kiosk-agent/calvin_display_agent.py" "$CALVIN_BIN_DIR/calvin_display_agent.py" || fail "agent not installed from the checkout"
assert_mode "$CALVIN_SYSTEMD_DIR/calvin-display-agent.service" 644
assert_contains "$CALVIN_KIOSK_ENV_FILE" '^CALVIN_BACKEND_URL=http://localhost:8123$'
assert_contains "$CALVIN_KIOSK_ENV_FILE" '^CALVIN_DISPLAY_ROTATION=left$' "operator setting dropped"
assert_not_contains "$CALVIN_KIOSK_ENV_FILE" '^CALVIN_KIOSK_ID=' "all-in-one must use the global config, not register as a kiosk"
assert_contains "$tmp/systemctl.log" 'enable calvin-display-agent.service'
pass "display agent installed for localhost:CALVIN_PORT"
