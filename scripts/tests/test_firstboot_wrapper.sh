#!/usr/bin/env bash
# Verifies the boot-2 firstboot wrapper waits for the server, runs the baked
# installer once (no reboot of its own), is idempotent via a sentinel, and reboots.
set -euo pipefail

WRAPPER="$(dirname "$0")/../../deploy/kiosk-agent/calvin-kiosk-firstboot.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# Mock curl (health probe) and systemctl on PATH; record their invocations.
mkdir -p "$tmp/bin"
cat > "$tmp/bin/curl" <<EOF
#!/usr/bin/env bash
echo "curl \$*" >> "$tmp/curl.log"
[ -z "\${MOCK_SERVER_DOWN:-}" ]
EOF
cat > "$tmp/bin/systemctl" <<EOF
#!/usr/bin/env bash
echo "systemctl \$*" >> "$tmp/systemctl.log"
EOF
chmod +x "$tmp/bin/curl" "$tmp/bin/systemctl"
export PATH="$tmp/bin:$PATH"

# Stub installer (the real one is baked to /usr/local/bin/calvin-kiosk-install.sh).
cat > "$tmp/installer.sh" <<EOF
#!/usr/bin/env bash
echo "INSTALL \$*" >> "$tmp/install.log"
EOF
export CALVIN_KIOSK_INSTALLER="$tmp/installer.sh"
export CALVIN_FIRSTBOOT_SENTINEL="$tmp/firstboot.done"
export CALVIN_KIOSK_ENV_FILE="$tmp/calvin-kiosk"
export CALVIN_FIRSTBOOT_POLL_SECS=0
cat > "$CALVIN_KIOSK_ENV_FILE" <<EOF
CALVIN_BACKEND_URL=http://homeserver.local:8000
EOF

# Server unreachable past the wait budget => fail, no install, no sentinel, no reboot.
if MOCK_SERVER_DOWN=1 CALVIN_FIRSTBOOT_WAIT_SECS=0 bash "$WRAPPER" 2>/dev/null; then
    echo "FAIL: succeeded with the server down"; exit 1; fi
[ ! -f "$tmp/install.log" ] || { echo "FAIL: installed with the server down"; exit 1; }
[ ! -f "$CALVIN_FIRSTBOOT_SENTINEL" ] || { echo "FAIL: sentinel written on failure"; exit 1; }
[ ! -f "$tmp/systemctl.log" ] || { echo "FAIL: rebooted on failure"; exit 1; }
echo "PASS firstboot-waits-for-server"
rm -f "$tmp/curl.log"

# First run: probes the server health, runs the installer against it.
bash "$WRAPPER"
grep -q 'http://homeserver.local:8000/api/health' "$tmp/curl.log" \
    || { echo "FAIL: server health not probed"; exit 1; }
grep -qx 'INSTALL --backend-url http://homeserver.local:8000 --no-reboot' "$tmp/install.log" \
    || { echo "FAIL: installer not run with backend url"; cat "$tmp/install.log"; exit 1; }
[ -f "$CALVIN_FIRSTBOOT_SENTINEL" ] || { echo "FAIL: sentinel not written"; exit 1; }
grep -q "disable calvin-kiosk-firstboot.service" "$tmp/systemctl.log" \
    || { echo "FAIL: firstboot unit not disabled"; exit 1; }
grep -qw "reboot" "$tmp/systemctl.log" || { echo "FAIL: no reboot requested"; exit 1; }
echo "PASS firstboot-runs-installer"

# Second run: sentinel present => no new install, exits 0.
rm -f "$tmp/install.log"
bash "$WRAPPER"
[ ! -f "$tmp/install.log" ] || { echo "FAIL: not idempotent"; exit 1; }
echo "PASS firstboot-idempotent"

# The unit retries a failed run (server down past the wait) instead of leaving a
# handed-off Pi blank until someone power-cycles it.
UNIT="$(dirname "$0")/../../deploy/systemd/calvin-kiosk-firstboot.service"
grep -qx 'Restart=on-failure' "$UNIT" || { echo "FAIL: firstboot unit does not retry"; exit 1; }
echo "PASS firstboot-unit-retries"

echo "PASS"
