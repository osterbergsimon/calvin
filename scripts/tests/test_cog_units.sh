#!/usr/bin/env bash
# cog display unit (opt-in, Pi 3-class): cog runs directly on DRM/KMS as the
# calvin user, takes tty1 over exactly like calvin-x/calvin-wayland, rotates with
# the gles renderer only, and treats its SIGSEGV-on-SIGTERM exit as a clean stop.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
# shellcheck source=helpers/assert.sh
. "$HERE/helpers/assert.sh"

cog="$REPO/deploy/systemd/calvin-cog.service"
helper="$REPO/deploy/kiosk-agent/calvin-cog-panel.sh"
[ -f "$cog" ] || fail "calvin-cog.service is missing"
[ -f "$helper" ] || fail "calvin-cog-panel.sh is missing"

# Same PAM/logind/tty session shape as calvin-x.service: no session, no DRM master.
assert_contains "$cog" '^User=calvin$' "calvin-cog.service does not run as calvin"
assert_contains "$cog" '^PAMName=login$' "calvin-cog.service opens no login session"
assert_contains "$cog" '^TTYPath=/dev/tty1$' "calvin-cog.service does not own tty1"
assert_contains "$cog" '^TTYReset=yes$' "tty1 is not reset between restarts"
assert_contains "$cog" '^SupplementaryGroups=.*video' "calvin cannot open /dev/dri/card0"
assert_contains "$cog" '^SupplementaryGroups=.*render' "calvin cannot open the render node"
assert_contains "$cog" '^SupplementaryGroups=.*input' "calvin cannot read /dev/input"
# Exactly one display owner.
assert_contains "$cog" '^Conflicts=.*getty@tty1\.service' "cog does not conflict with getty@tty1"
assert_contains "$cog" '^Conflicts=.*calvin-x\.service' "cog does not conflict with the X server"
assert_contains "$cog" '^Conflicts=.*calvin-wayland\.service' "cog does not conflict with labwc"
assert_contains "$cog" '^Before=.*calvin-display-agent\.service' \
    "the display agent may start before cog"
assert_contains "$cog" '^After=.*network-online\.target' "cog may start before the network"
assert_contains "$cog" '^WantedBy=graphical\.target$' "calvin-cog.service starts at boot"
pass "calvin-cog.service has the calvin-x/x session shape"

# DRM launch line: the gles renderer is mandatory for rotation, rotation comes
# from the file the display agent's helper writes, and cog restarts its own web
# process on a crash.
assert_contains "$cog" '^ExecStart=' "calvin-cog.service has no ExecStart"
assert_contains "$cog" '/usr/bin/cog' "calvin-cog.service does not start cog"
assert_contains "$cog" '--platform=drm' "cog does not use the DRM platform"
assert_contains "$cog" 'renderer=gles' "cog must use the gles renderer (rotation)"
assert_not_contains "$cog" 'renderer=modeset' "the modeset renderer cannot rotate"
assert_contains "$cog" 'CALVIN_COG_ROTATION:-0' "cog rotation is not read from the env file"
assert_contains "$cog" '--webprocess-failure=restart' "cog lost crash recovery"
assert_contains "$cog" '^EnvironmentFile=-/etc/default/calvin-kiosk$' \
    "cog does not read the kiosk env (backend URL / kiosk id)"
assert_contains "$cog" '^EnvironmentFile=-/etc/default/calvin-kiosk-cog$' \
    "cog does not read the rotation env file"
assert_contains "$cog" 'CALVIN_KIOSK_ID' "the kiosk id query parameter was dropped"
assert_contains "$cog" 'CALVIN_KIOSK_HOSTNAME' "the kiosk hostname query parameter was dropped"
pass "cog launches on DRM with the gles renderer and the agent-managed rotation"

# SIGSEGV on SIGTERM is cog's normal exit; without this a screen-off looks like a
# crash and Restart=always restarts it forever.
assert_contains "$cog" '^SuccessExitStatus=SIGSEGV$' "cog's SIGSEGV stop is treated as a crash"
assert_contains "$cog" '^Restart=always$' "a crashed cog would not come back"
assert_contains "$cog" '^RestartSec=5$' "cog restarts without a backoff"
pass "a screen-off stop is not a crash loop"

# The hardware helper: root-owned, validates the rotation, and is the only thing
# the calvin user may run through sudo.
assert_contains "$helper" '^#!/usr/bin/env bash$' "the panel helper is not a bash script"
# shellcheck disable=SC2016  # matching the literal script text
assert_contains "$helper" 'stop "\$UNIT"' "the helper does not stop cog before blanking"
# shellcheck disable=SC2016  # matching the literal script text
assert_contains "$helper" 'printf .*%s.*> "\$FB_BLANK"' \
    "the helper does not write the framebuffer blank node"
assert_contains "$helper" 'rotate\)' "the helper has no rotate verb"
assert_contains "$helper" 'rotation must be 0, 1, 2 or 3' "the helper does not validate rotation"
pass "calvin-cog-panel.sh stops cog, blanks/holds the panel and validates rotation"

# The kiosk/agent units must know about the third stack; the Chromium unit must
# not be pulled in on cog at boot.
assert_contains "$REPO/deploy/systemd/calvin-display-agent.service" \
    '^After=.*calvin-cog\.service' "the display agent is not ordered after cog"
assert_contains "$REPO/scripts/setup-common.sh" 'CALVIN_COG_PACKAGES=' \
    "the installer does not install the cog package"
pass "agent ordering and package list know the cog stack"

echo "PASS"
