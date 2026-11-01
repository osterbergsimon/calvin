#!/usr/bin/env bash
# CLV-109: the all-in-one install (scripts/setup.sh, FULL/Mode A) picks its
# display stack the same way the kiosk installer does (resolve_display_stack):
# `auto` means cog, an explicit --display-stack x11|wayland|cog wins, and a
# re-run keeps the stack an existing install already has. A FULL host installed
# before the setting existed is X11 and stays X11 (no silent migration).
#
# systemctl, apt and docker are stubbed; nothing here touches the machine.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
# shellcheck source=helpers/assert.sh
. "$HERE/helpers/assert.sh"

tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
export LOG_FILE="$tmp/setup.log"
export CALVIN_ETC_DIR="$tmp/etc-calvin" CALVIN_BIN_DIR="$tmp/usr-local-bin"
export CALVIN_SYSTEMD_DIR="$tmp/systemd" CALVIN_DEFAULT_DIR="$tmp/etc-default"
export CALVIN_KIOSK_ENV_FILE="$tmp/etc-default/calvin-kiosk"
export CALVIN_KIOSK_DISPLAY_ENV_FILE="$tmp/etc-default/calvin-kiosk-display"
export CALVIN_KIOSK_COG_ENV_FILE="$tmp/etc-default/calvin-kiosk-cog"
export CALVIN_DEVICE_TREE_MODEL="$tmp/model"
export CALVIN_SUDOERS_DIR="$tmp/sudoers.d" CALVIN_POLKIT_DIR="$tmp/polkit"
export CALVIN_HOME_OVERRIDE="$tmp/home"
unset CALVIN_DISPLAY_STACK
mkdir -p "$tmp/home/calvin"
B="$tmp/bin"
export SYSTEMCTL_LOG="$tmp/systemctl.log"
make_stub "$B" chown ":"
make_stub "$B" systemctl "echo \"\$*\" >> \"\$SYSTEMCTL_LOG\""
make_stub "$B" docker "exit 0"
make_stub "$B" apt-get ":"
make_stub "$B" git ":"
make_stub "$B" sleep ":"
make_stub "$B" visudo "exit 0"
# shellcheck disable=SC2016  # literal stub body
make_stub "$B" id 'if [ "${1:-}" = "-u" ]; then echo 1000; exit 0; fi; exit 1'
export CALVIN_VISUDO="$B/visudo"
PATH="$B:$PATH"
printf '%s\0' "Raspberry Pi 4 Model B Rev 1.4" > "$CALVIN_DEVICE_TREE_MODEL"

# shellcheck source=../setup.sh
. "$HERE/../setup.sh" --source-only
CALVIN_DIR="$REPO"; CALVIN_SOURCE_DIR="$REPO"; GIT_BRANCH=develop; SETUP_MODE=prod
# The tests below exercise the enable/start path a real Pi takes.
systemd_available() { return 0; }

reset_host() {
    rm -rf "$CALVIN_DEFAULT_DIR" "$CALVIN_SYSTEMD_DIR" "$CALVIN_BIN_DIR" "$CALVIN_SUDOERS_DIR" "$SYSTEMCTL_LOG"
    mkdir -p "$CALVIN_DEFAULT_DIR"
    DISPLAY_STACK_ARG=""
    DISPLAY_STACK=""
}
kiosk_value() { read_env_value "$CALVIN_KIOSK_ENV_FILE" "$1"; }

# --- 1. Resolution ------------------------------------------------------------
reset_host
assert_eq "cog" "$(requested_display_stack)" "a fresh FULL install must default to cog"
parse_args --display-stack x11
assert_eq "x11" "$(requested_display_stack)" "--display-stack x11 must win on a fresh FULL install"
parse_args --display-stack=wayland
assert_eq "wayland" "$(requested_display_stack)" "--display-stack=wayland must win"
DISPLAY_STACK_ARG=""
assert_eq "wayland" "$(CALVIN_DISPLAY_STACK=wayland requested_display_stack)" \
    "CALVIN_DISPLAY_STACK must win over auto"
DISPLAY_STACK_ARG="bogus"
if requested_display_stack >/dev/null 2>&1; then
    fail "an invalid --display-stack was accepted"
fi
DISPLAY_STACK_ARG=""
pass "FULL resolution: auto -> cog, explicit flag/env wins"

# A re-run keeps the recorded stack ...
printf 'CALVIN_BACKEND_URL=http://localhost:8000\nCALVIN_DISPLAY_STACK=x11\n' > "$CALVIN_KIOSK_ENV_FILE"
assert_eq "x11" "$(requested_display_stack)" "a re-run must keep the recorded x11 stack"
printf 'CALVIN_DISPLAY_STACK=cog\n' > "$CALVIN_KIOSK_ENV_FILE"
assert_eq "cog" "$(requested_display_stack)" "a re-run must keep the recorded cog stack"
DISPLAY_STACK_ARG="x11"
assert_eq "x11" "$(requested_display_stack)" "--display-stack must switch an existing FULL install"
# shellcheck disable=SC2034  # read by requested_display_stack (setup-common.sh)
DISPLAY_STACK_ARG=""

# ... and a FULL host from before the setting existed is X11: either its kiosk
# config has no CALVIN_DISPLAY_STACK, or it predates that file and only has the
# FULL Chromium unit installed.
printf 'CALVIN_BACKEND_URL=http://localhost:8000\n' > "$CALVIN_KIOSK_ENV_FILE"
assert_eq "x11" "$(requested_display_stack)" "a legacy FULL install (no recorded stack) must stay x11"
rm -f "$CALVIN_KIOSK_ENV_FILE"
mkdir -p "$CALVIN_SYSTEMD_DIR"; : > "$CALVIN_SYSTEMD_DIR/calvin-kiosk.service"
assert_eq "x11" "$(requested_display_stack)" \
    "a legacy FULL install (kiosk unit, no kiosk config) must stay x11"
pass "FULL re-run keeps the recorded stack; legacy installs stay x11"

# --- 2. Packages: cog is added on top of the shared X11/Chromium set ----------
reset_host
installed=()
install_system_packages() { installed+=("$@"); }
install_full_packages cog >/dev/null
for p in git cron chromium xserver-xorg cog; do
    printf '%s\n' "${installed[@]}" | grep -qx "$p" || fail "FULL cog install did not install $p"
done
installed=()
install_full_packages x11 >/dev/null
printf '%s\n' "${installed[@]}" | grep -qx cog && fail "FULL x11 install pulled in cog"
pass "FULL packages follow the stack (X11 set stays installed)"

# --- 3. Fresh FULL install on cog ---------------------------------------------
reset_host
DISPLAY_STACK="$(requested_display_stack)"
refresh_host_files >/dev/null
assert_eq "cog" "$(kiosk_value CALVIN_DISPLAY_STACK)" "the FULL install did not record cog"
assert_eq "http://localhost:8000" "$(kiosk_value CALVIN_BACKEND_URL)" "cog has no backend URL to open"
for u in calvin-cog calvin-x calvin-wayland calvin-kiosk calvin-app calvin-display-agent; do
    cmp -s "$REPO/deploy/systemd/$u.service" "$CALVIN_SYSTEMD_DIR/$u.service" \
        || fail "$u.service not installed from the checkout"
done
cmp -s "$REPO/deploy/systemd/calvin-cog.service.d/calvin-full.conf" \
    "$CALVIN_SYSTEMD_DIR/calvin-cog.service.d/calvin-full.conf" \
    || fail "the FULL cog drop-in (wait for the local backend) is not installed"
cmp -s "$REPO/deploy/kiosk-agent/calvin-cog-panel.sh" "$CALVIN_BIN_DIR/calvin-cog-panel.sh" \
    || fail "the cog panel helper is not installed"
assert_mode "$CALVIN_BIN_DIR/calvin-cog-panel.sh" 755
assert_contains "$CALVIN_SUDOERS_DIR/calvin-kiosk-cog" \
    'NOPASSWD: /usr/local/bin/calvin-cog-panel.sh on, /usr/local/bin/calvin-cog-panel.sh off, /usr/local/bin/calvin-cog-panel.sh rotate \*$' \
    "the cog panel sudoers fragment is not installed"
assert_eq "0" "$(read_env_value "$CALVIN_KIOSK_COG_ENV_FILE" CALVIN_COG_ROTATION)" "cog rotation not seeded"
assert_not_contains "$CALVIN_KIOSK_DISPLAY_ENV_FILE" '^DISPLAY=' "the cog session env sets DISPLAY"
assert_contains "$SYSTEMCTL_LOG" '^enable calvin-app\.service$' "calvin-app not enabled"
assert_contains "$SYSTEMCTL_LOG" '^enable calvin-cog\.service$' "cog not enabled on a FULL install"
assert_contains "$SYSTEMCTL_LOG" '^disable calvin-x\.service$' "X11 not disabled on a FULL cog install"
assert_contains "$SYSTEMCTL_LOG" '^disable calvin-kiosk\.service$' "FULL Chromium not disabled on cog"
assert_not_contains "$SYSTEMCTL_LOG" '^enable calvin-(x|kiosk|kiosk-remote)\.service$' \
    "a FULL cog install enabled X11/Chromium"
pass "fresh FULL install on cog: cog owns the display, Chromium stays off"

rm -f "$SYSTEMCTL_LOG"
start_runtime_services >/dev/null
assert_contains "$SYSTEMCTL_LOG" '^start calvin-cog\.service$' "cog not started"
assert_not_contains "$SYSTEMCTL_LOG" '^start calvin-(x|kiosk)\.service$' "X11/Chromium started on cog"
pass "FULL cog install starts cog, not X11/Chromium"

# A refresh (what update-calvin.sh runs) keeps cog without being told.
rm -f "$SYSTEMCTL_LOG"; DISPLAY_STACK=""
refresh_host_files >/dev/null
assert_eq "cog" "$(kiosk_value CALVIN_DISPLAY_STACK)" "a refresh changed the recorded cog stack"
assert_contains "$SYSTEMCTL_LOG" '^enable calvin-cog\.service$' "a refresh dropped cog"
pass "a FULL refresh keeps cog"

# --- 4. Re-run on a legacy X11 FULL install: stays X11 --------------------------
reset_host
mkdir -p "$CALVIN_SYSTEMD_DIR"; : > "$CALVIN_SYSTEMD_DIR/calvin-kiosk.service"
printf 'CALVIN_BACKEND_URL=http://localhost:8000\n' > "$CALVIN_KIOSK_ENV_FILE"
refresh_host_files >/dev/null
assert_eq "x11" "$(kiosk_value CALVIN_DISPLAY_STACK)" "a legacy FULL install was not kept on x11"
assert_eq ":0" "$(read_env_value "$CALVIN_KIOSK_DISPLAY_ENV_FILE" DISPLAY)" "x11 session env lost DISPLAY"
assert_contains "$SYSTEMCTL_LOG" '^enable calvin-x\.service$' "X11 not kept enabled"
assert_contains "$SYSTEMCTL_LOG" '^enable calvin-kiosk\.service$' "FULL Chromium not kept enabled"
assert_contains "$SYSTEMCTL_LOG" '^disable calvin-cog\.service$' "cog not kept off on X11"
assert_not_contains "$SYSTEMCTL_LOG" '^enable calvin-(cog|kiosk-remote)\.service$' \
    "a legacy X11 FULL install was migrated"
rm -f "$SYSTEMCTL_LOG"
start_runtime_services >/dev/null
assert_contains "$SYSTEMCTL_LOG" '^start calvin-x\.service$' "X11 not started"
assert_contains "$SYSTEMCTL_LOG" '^start calvin-kiosk\.service$' "FULL Chromium not started"
assert_not_contains "$SYSTEMCTL_LOG" '^start calvin-cog\.service$' "cog started on X11"
pass "a legacy X11 FULL install stays X11"

# --- 5. Explicit wayland on FULL ------------------------------------------------
reset_host
DISPLAY_STACK="wayland"
refresh_host_files >/dev/null
assert_eq "wayland" "$(kiosk_value CALVIN_DISPLAY_STACK)" "explicit wayland not recorded"
assert_contains "$SYSTEMCTL_LOG" '^enable calvin-wayland\.service$' "labwc not enabled"
assert_contains "$SYSTEMCTL_LOG" '^enable calvin-kiosk\.service$' "FULL Chromium not enabled on wayland"
assert_contains "$SYSTEMCTL_LOG" '^disable calvin-x\.service$' "X11 not disabled on wayland"
assert_contains "$tmp/home/calvin/.config/labwc/rc.xml" 'autoEnableOutputs' "labwc config not written"
# The FULL Chromium unit must not pull X back in on a Wayland session (calvin-x
# conflicts with calvin-wayland), and it must wait for whichever compositor runs.
unit="$REPO/deploy/systemd/calvin-kiosk.service"
assert_not_contains "$unit" '^Wants=.*calvin-x\.service' "calvin-kiosk.service pulls X11 into every stack"
assert_contains "$unit" '^After=.*calvin-wayland\.service' "calvin-kiosk.service does not order after labwc"
assert_contains "$unit" 'WAYLAND_DISPLAY' "calvin-kiosk.service cannot wait for a Wayland session"
pass "explicit wayland on FULL enables labwc + Chromium"

echo "PASS"
