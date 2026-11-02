#!/usr/bin/env bash
# K5: re-running setup-kiosk.sh truncated /etc/default/calvin-kiosk, dropping the
# rotation/output/resolution settings the docs tell operators to put there. It
# now upserts its own keys and leaves every other line alone.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=helpers/assert.sh
. "$HERE/helpers/assert.sh"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
export LOG_FILE="$tmp/setup.log"
export CALVIN_KIOSK_ENV_FILE="$tmp/calvin-kiosk"
export HOSTNAME_OVERRIDE=kitchen MACHINE_ID_OVERRIDE=abcdef0123

# shellcheck source=../setup-common.sh
. "$HERE/../setup-common.sh"
# shellcheck source=../setup-kiosk.sh
. "$HERE/../setup-kiosk.sh" --source-only

cat > "$CALVIN_KIOSK_ENV_FILE" <<'EOF'
# operator notes
CALVIN_BACKEND_URL=http://old-server:8000
CALVIN_DISPLAY_ROTATION=left
CALVIN_DISPLAY_OUTPUT=HDMI-1
CALVIN_DISPLAY_RESOLUTION=1920x1080@60
EOF
chmod 0644 "$CALVIN_KIOSK_ENV_FILE"

BACKEND_URL="http://new-server:8000"
install_kiosk_config >/dev/null

f="$CALVIN_KIOSK_ENV_FILE"
assert_contains "$f" '^CALVIN_BACKEND_URL=http://new-server:8000$'
assert_eq 1 "$(grep -c '^CALVIN_BACKEND_URL=' "$f")" "backend URL duplicated"
assert_contains "$f" '^CALVIN_DISPLAY_ROTATION=left$' "rotation dropped"
assert_contains "$f" '^CALVIN_DISPLAY_OUTPUT=HDMI-1$' "output dropped"
assert_contains "$f" '^CALVIN_DISPLAY_RESOLUTION=1920x1080@60$' "resolution dropped"
assert_contains "$f" '^# operator notes$' "comment dropped"
assert_contains "$f" '^CALVIN_KIOSK_ID=kitchen-abcdef$'
assert_mode "$f" 644
pass "re-run keeps operator settings and updates the backend URL"

# Fresh install: file created 0644 with the managed keys.
rm -f "$f"
install_kiosk_config >/dev/null
assert_mode "$f" 644
assert_contains "$f" '^CALVIN_KIOSK_HOSTNAME=kitchen$'
pass "fresh env file created"

# --signing-key-file (K7: --signing-key <hex> leaks into ps and shell history).
key=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
printf '%s\n' "$key" > "$tmp/key"
parse_args --backend-url http://s:8000 --signing-key-file "$tmp/key"
assert_eq "$key" "$SIGNING_KEY"
pass "--signing-key-file read"
