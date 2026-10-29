#!/usr/bin/env bash
# P5: Chromium ran with --no-sandbox (and --no-zygote, which requires it), so one
# renderer exploit from plugin/iframe content ran with calvin's full rights.
# P9: the all-in-one kiosk unit hard-coded port 8000; it now reads CALVIN_PORT
# from /etc/calvin/.env.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
# shellcheck source=helpers/assert.sh
. "$HERE/helpers/assert.sh"

for unit in calvin-kiosk.service calvin-kiosk-remote.service; do
    f="$REPO/deploy/systemd/$unit"
    assert_not_contains "$f" '--no-sandbox' "$unit still disables the Chromium sandbox"
    assert_not_contains "$f" '--no-zygote' "$unit still passes --no-zygote (only valid with --no-sandbox)"
done
pass "Chromium sandbox enabled in both kiosk units"

f="$REPO/deploy/systemd/calvin-kiosk.service"
assert_contains "$f" '^EnvironmentFile=-/etc/calvin/\.env$' "calvin-kiosk.service does not read /etc/calvin/.env"
assert_not_contains "$f" 'localhost:8000' "calvin-kiosk.service still hard-codes port 8000"
assert_contains "$f" 'localhost:\$\{CALVIN_PORT:-8000\}' "calvin-kiosk.service does not use CALVIN_PORT"
pass "calvin-kiosk.service uses CALVIN_PORT"

# The generated openbox autostart (Chromium-launching variant) too.
assert_not_contains "$REPO/scripts/setup-common.sh" 'localhost:8000/api/health' "openbox autostart hard-codes port 8000"
pass "openbox autostart has no hard-coded port"
