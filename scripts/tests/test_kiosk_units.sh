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

# The all-in-one display has no ?kiosk= id, so the page is told it is a kiosk
# for link handling (calvin-eugy): links there must never navigate the wall.
assert_contains "$f" '/\?display=kiosk"' "calvin-kiosk.service does not mark the display as a kiosk for links"
pass "calvin-kiosk.service marks its display for kiosk link handling"

# The generated openbox autostart (Chromium-launching variant) too.
assert_not_contains "$REPO/scripts/setup-common.sh" 'localhost:8000/api/health' "openbox autostart hard-codes port 8000"
pass "openbox autostart has no hard-coded port"

# Every launcher tells the page its display has no tabs or back button. A registered
# kiosk carries ?kiosk=<id>; one without an id falls back to ?display=kiosk, so a
# link can never strand the wall (calvin-eugy). The URL applies on the next kiosk
# restart.
for unit in calvin-cog.service calvin-kiosk-remote.service; do
    assert_contains "$REPO/deploy/systemd/$unit" 'else q="display=kiosk"' "$unit has no display=kiosk fallback when CALVIN_KIOSK_ID is unset"
done
assert_contains "$REPO/scripts/setup-common.sh" '/\?display=kiosk &' "openbox autostart does not mark the display as a kiosk"
pass "every kiosk launcher marks its display for kiosk link handling"
