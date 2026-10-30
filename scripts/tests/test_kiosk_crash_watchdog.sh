#!/usr/bin/env bash
# CLV-25: a renderer crash ("Aw, Snap! error 11") leaves Chromium's browser
# process alive, so systemd's Restart=always never fires and the kiosk stays on
# the crash page. The display agent probes the page over the Chrome DevTools
# Protocol and restarts the kiosk unit, which needs the debugging port open on
# loopback only - on BOTH display stacks, which share these units - and never
# exposed to the LAN.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
# shellcheck source=helpers/assert.sh
. "$HERE/helpers/assert.sh"

for unit in calvin-kiosk.service calvin-kiosk-remote.service; do
    f="$REPO/deploy/systemd/$unit"
    assert_contains "$f" '--remote-debugging-port=' \
        "$unit does not open a debugging port for the crash watchdog"
    assert_contains "$f" '--remote-debugging-address=127\.0\.0\.1' \
        "$unit does not bind the debugging port to loopback"
    assert_not_contains "$f" 'remote-debugging-address=0\.0\.0\.0' \
        "$unit exposes the debugging port to the LAN"
done
pass "both kiosk units expose DevTools on loopback only"

# The unit and the agent must agree on the port name, or the watchdog probes a
# port nothing listens on and never fires.
for unit in calvin-kiosk.service calvin-kiosk-remote.service; do
    assert_contains "$REPO/deploy/systemd/$unit" 'CALVIN_KIOSK_CDP_PORT' \
        "$unit hard-codes a port the agent cannot follow"
done
agent="$REPO/deploy/kiosk-agent/calvin_display_agent.py"
assert_contains "$agent" 'CALVIN_KIOSK_CDP_PORT' \
    "the agent does not read the port the units pass"
assert_contains "$agent" 'restart_kiosk_unit' "the agent has no kiosk restart path"
pass "agent and units agree on the debugging port"

# The agent is a kiosk bundle file, so an Update delivers the recovery to
# kiosks that are already installed.
assert_contains "$REPO/backend/app/services/kiosk_bundle.py" \
    'calvin_display_agent\.py' "the agent is not in the kiosk bundle"
pass "the recovery ships with the kiosk bundle"

echo "PASS"
