#!/usr/bin/env bash
# Verifies the firstboot wrapper runs setup once, is idempotent, and reboots.
set -euo pipefail

WRAPPER="$(dirname "$0")/../../deploy/kiosk-agent/calvin-kiosk-firstboot.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# Mock curl, bash-target, systemctl on PATH; record their invocations.
mkdir -p "$tmp/bin"
cat > "$tmp/bin/curl" <<EOF
#!/usr/bin/env bash
echo "echo CURL_RAN >> '$tmp/curl.log'"
EOF
cat > "$tmp/bin/systemctl" <<EOF
#!/usr/bin/env bash
echo "systemctl \$*" >> "$tmp/systemctl.log"
EOF
chmod +x "$tmp/bin/curl" "$tmp/bin/systemctl"
export PATH="$tmp/bin:$PATH"

export CALVIN_FIRSTBOOT_SENTINEL="$tmp/firstboot.done"
export CALVIN_KIOSK_ENV_FILE="$tmp/calvin-kiosk"
cat > "$CALVIN_KIOSK_ENV_FILE" <<EOF
CALVIN_BACKEND_URL=http://homeserver.local:8000
CALVIN_SETUP_KIOSK_URL=https://raw.example/setup-kiosk.sh
EOF

# First run: curl piped to bash executes the mock's echoed command.
bash "$WRAPPER"
[ -f "$tmp/curl.log" ] || { echo "FAIL: setup script not fetched/run"; exit 1; }
[ -f "$CALVIN_FIRSTBOOT_SENTINEL" ] || { echo "FAIL: sentinel not written"; exit 1; }
grep -q "reboot" "$tmp/systemctl.log" || { echo "FAIL: no reboot requested"; exit 1; }

# Second run: sentinel present => no new curl, exits 0.
rm -f "$tmp/curl.log"
bash "$WRAPPER"
[ ! -f "$tmp/curl.log" ] || { echo "FAIL: not idempotent"; exit 1; }

echo "PASS"
