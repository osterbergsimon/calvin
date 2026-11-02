#!/usr/bin/env bash
set -euo pipefail
here="$(dirname "$0")"
unit="$here/../../deploy/systemd/calvin-kiosk-update.service"
sudoers="$here/../../deploy/kiosk-agent/calvin-kiosk-update.sudoers"

grep -q '^Type=oneshot' "$unit" || { echo "FAIL: not oneshot"; exit 1; }
grep -q '^ExecStart=/usr/local/bin/update-kiosk.sh' "$unit" || { echo "FAIL: wrong ExecStart"; exit 1; }
! grep -q '^\[Install\]' "$unit" || { echo "FAIL: must not be enable-able"; exit 1; }
grep -q 'systemctl start --no-block calvin-kiosk-update.service' "$sudoers" || { echo "FAIL: sudoers rule missing"; exit 1; }
echo "PASS"
