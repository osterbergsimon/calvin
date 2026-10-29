#!/usr/bin/env bash
# P1: PR #127 added `After=graphical.target` to calvin-kiosk-remote.service, which is
# WantedBy=multi-user.target. graphical.target is itself After=multi-user.target, so
# systemd found an ordering cycle at boot and deleted the kiosk job: the dashboard
# never started. A unit pulled in by multi-user.target must not wait for graphical.target
# (and vice versa), or the cycle comes back.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
# shellcheck source=helpers/assert.sh
. "$HERE/helpers/assert.sh"

# Returns the space-separated members of the last KEY= line in a unit file.
unit_key() {  # file KEY
    awk -v k="$2" '
        index($0, k "=") == 1 {
            sub(/^[^=]*=/, "")
            print
        }
    ' "$1" | tail -n1
}

want_multi_user="multi-user.target"
want_graphical="graphical.target"

checked=0
for unit in "$REPO"/deploy/systemd/*.service; do
    name="$(basename "$unit")"
    wantedby=" $(unit_key "$unit" WantedBy) "
    after=" $(unit_key "$unit" After) "
    before=" $(unit_key "$unit" Before) "

    case "$wantedby" in
    *" $want_multi_user "*)
        case " $after " in
        *" $want_graphical "*)
            fail "$name is WantedBy=$want_multi_user but After=$want_graphical (ordering cycle)"
            ;;
        esac
        case " $before " in
        *" $want_graphical "*)
            fail "$name is WantedBy=$want_multi_user but Before=$want_graphical (ordering cycle)"
            ;;
        esac
        ;;
    *" $want_graphical "*)
        case " $after " in
        *" $want_multi_user "*)
            fail "$name is WantedBy=$want_graphical but After=$want_multi_user (ordering cycle)"
            ;;
        esac
        ;;
    esac
    checked=$((checked + 1))
done
[ "$checked" -gt 0 ] || fail "no deploy/systemd/*.service files found"
pass "no unit orders against the target that pulls it in ($checked units)"

# The kiosk still needs graphical.target in Wants= (it pulls in calvin-x/calvin-wayland),
# just not in After= — dropping the dependency would leave Chromium with no compositor.
f="$REPO/deploy/systemd/calvin-kiosk-remote.service"
assert_contains "$f" '^Wants=.*graphical\.target' \
    "calvin-kiosk-remote.service no longer pulls in graphical.target"
assert_contains "$f" '^After=.*calvin-x\.service' "calvin-kiosk-remote.service does not order after calvin-x.service"
assert_contains "$f" '^After=.*calvin-wayland\.service' \
    "calvin-kiosk-remote.service does not order after calvin-wayland.service"
pass "calvin-kiosk-remote.service keeps the compositor dependency without the cycle"

echo "PASS"
