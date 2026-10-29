#!/usr/bin/env bash
# Wayland unit shape (phase 1): labwc takes tty1 over the same way Xorg does, and
# the kiosk/agent units get their session environment from the generated env file
# instead of hard-coding DISPLAY/XAUTHORITY.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
# shellcheck source=helpers/assert.sh
. "$HERE/helpers/assert.sh"

wayland="$REPO/deploy/systemd/calvin-wayland.service"
[ -f "$wayland" ] || fail "calvin-wayland.service is missing"

# Same PAM/logind session shape as calvin-x.service: no session, no DRM master.
assert_contains "$wayland" '^User=calvin$' "calvin-wayland.service does not run as calvin"
assert_contains "$wayland" '^PAMName=login$' "calvin-wayland.service opens no login session"
assert_contains "$wayland" '^TTYPath=/dev/tty1$' "calvin-wayland.service does not own tty1"
assert_contains "$wayland" '^TTYReset=yes$' "tty1 is not reset between restarts"
assert_contains "$wayland" '^Conflicts=.*getty@tty1\.service' "calvin-wayland.service does not conflict with getty@tty1"
assert_contains "$wayland" '^Conflicts=.*calvin-x\.service' "the two compositors do not conflict"
assert_contains "$wayland" '^Before=.*calvin-kiosk\.service' "kiosk unit may start before the compositor"
assert_contains "$wayland" '^Before=.*calvin-kiosk-remote\.service' "remote kiosk unit may start before the compositor"
assert_contains "$wayland" '^ExecStart=/usr/bin/labwc$' "calvin-wayland.service does not start labwc"
assert_contains "$wayland" '^Restart=always$' "a crashed compositor would not come back"
assert_contains "$wayland" '^WantedBy=graphical\.target$' "calvin-wayland.service starts at boot"
pass "calvin-wayland.service has the calvin-x.service session shape"

# Exactly one compositor unit is enabled at a time; both are installed by the
# bundle but only setup-kiosk.sh --display-stack enables one (the backend tests
# pin enable=False for the Wayland unit in the manifest).
assert_not_contains "$REPO/deploy/systemd/calvin-x.service" 'calvin-wayland' \
    "calvin-x.service should not depend on the Wayland unit"
pass "compositor units are independent"

for unit in calvin-kiosk-remote.service calvin-display-agent.service; do
    f="$REPO/deploy/systemd/$unit"
    assert_contains "$f" '^EnvironmentFile=/etc/default/calvin-kiosk-display$' \
        "$unit does not read the display session env file"
    assert_not_contains "$f" '^Environment="DISPLAY=' "$unit still hard-codes DISPLAY"
    assert_not_contains "$f" '^Environment="XAUTHORITY=' "$unit still hard-codes XAUTHORITY"
done
pass "kiosk and agent units take the session env from one generated file"

# The kiosk unit must wait for whichever display server the stack brings up.
f="$REPO/deploy/systemd/calvin-kiosk-remote.service"
assert_contains "$f" 'WAYLAND_DISPLAY' "kiosk unit does not wait for the Wayland socket"
assert_contains "$f" '/tmp/\.X11-unix/X0' "kiosk unit no longer waits for Xorg"
assert_contains "$f" 'CALVIN_CHROMIUM_DISPLAY_FLAGS' \
    "Chromium does not get a stack-specific flag from the session env"
assert_contains "$f" '^\s*--kiosk' "kiosk mode was dropped"
assert_contains "$f" 'CALVIN_KIOSK_ID' "the kiosk id query parameter was dropped"
assert_contains "$f" 'CALVIN_KIOSK_HOSTNAME' "the kiosk hostname query parameter was dropped"
pass "Chromium keeps kiosk mode and URL handling on both stacks"

echo "PASS"
