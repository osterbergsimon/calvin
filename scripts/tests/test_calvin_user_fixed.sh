#!/usr/bin/env bash
# P8: CALVIN_USER could be overridden, but the systemd units, sudoers and the
# kiosk bundle hard-code `calvin`. The override is now refused up front.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=helpers/assert.sh
. "$HERE/helpers/assert.sh"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
export LOG_FILE="$tmp/setup.log"

for script in setup.sh setup-kiosk.sh; do
    args=()
    [ "$script" = setup-kiosk.sh ] && args=(--backend-url http://server:8000)
    out="$(CALVIN_USER=pi bash "$HERE/../$script" "${args[@]}" 2>&1)" && fail "$script accepted CALVIN_USER=pi"
    printf '%s' "$out" | grep -q 'CALVIN_USER' || fail "$script did not explain the CALVIN_USER refusal: $out"
    pass "$script refuses CALVIN_USER=pi"
done
