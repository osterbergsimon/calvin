#!/usr/bin/env bash
# Display stack selection + in-place switching (phase 1, opt-in Wayland).
#
# Covers CALVIN_DISPLAY_STACK resolution, the package split, the generated session
# env file, the labwc config, and that switching X11 <-> Wayland enables exactly
# one compositor unit and is idempotent in both directions. systemctl is stubbed;
# nothing here touches the machine's real units.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
# shellcheck source=helpers/assert.sh
. "$HERE/helpers/assert.sh"

tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/home/calvin" "$tmp/systemd"
export LOG_FILE="$tmp/setup.log"
export CALVIN_HOME_OVERRIDE="$tmp/home"
export CALVIN_SYSTEMD_DIR="$tmp/systemd"
export CALVIN_KIOSK_ENV_FILE="$tmp/calvin-kiosk"
export CALVIN_KIOSK_DISPLAY_ENV_FILE="$tmp/calvin-kiosk-display"
export SYSTEMCTL_LOG="$tmp/systemctl.log"
make_stub "$tmp/bin" systemctl "echo \"\$*\" >> \"\${SYSTEMCTL_LOG}\""
make_stub "$tmp/bin" chown ":"
# shellcheck disable=SC2016  # literal stub body
make_stub "$tmp/bin" id 'if [ "${1:-}" = "-u" ]; then echo 1000; exit 0; fi; exit 1'
PATH="$tmp/bin:$PATH"

# shellcheck source=../setup-common.sh
. "$REPO/scripts/setup-common.sh"

reset_systemctl_log() { rm -f "$SYSTEMCTL_LOG"; }

# --- 1. Selection -------------------------------------------------------------
# Phase 1: auto is X11 everywhere, so an existing kiosk that has no setting and
# no flag keeps what it has.
assert_eq "x11" "$(CALVIN_DISPLAY_STACK=auto resolve_display_stack)" "auto must mean x11 in phase 1"
assert_eq "x11" "$(unset CALVIN_DISPLAY_STACK; resolve_display_stack)" "unset must mean x11"
assert_eq "wayland" "$(CALVIN_DISPLAY_STACK=wayland resolve_display_stack)" "env override ignored"
assert_eq "x11" "$(CALVIN_DISPLAY_STACK=wayland resolve_display_stack x11)" "--display-stack must win over env"
assert_eq "wayland" "$(CALVIN_DISPLAY_STACK=x11 resolve_display_stack wayland)" "--display-stack must win over env"
if err="$(CALVIN_DISPLAY_STACK=bogus resolve_display_stack 2>&1)"; then
    fail "invalid CALVIN_DISPLAY_STACK accepted"
fi
echo "$err" | grep -q 'Invalid display stack' || fail "unclear error for invalid stack: $err"
pass "display stack selection"

# --- 2. Packages --------------------------------------------------------------
# Wayland is additive: the X11 set stays installed, so rollback is a unit switch.
wayland_pkgs="$(display_stack_packages wayland)"
for p in labwc wlr-randr wlopm; do
    echo "$wayland_pkgs" | grep -qx "$p" || fail "wayland package set is missing $p"
done
for p in xserver-xorg xinit openbox unclutter xdotool x11-xserver-utils chromium; do
    printf '%s\n' "${CALVIN_KIOSK_PACKAGES[@]}" | grep -qx "$p" \
        || fail "shared kiosk package set lost $p (X11 rollback needs it)"
done
[ -z "$(display_stack_packages x11)" ] || fail "x11 must not add packages beyond the shared set"
pass "package split keeps X11 installed"

# --- 3. Fresh install on each stack ------------------------------------------
reset_systemctl_log
apply_display_stack wayland calvin >/dev/null
assert_eq "wayland" "$(read_env_value "$CALVIN_KIOSK_DISPLAY_ENV_FILE" XDG_SESSION_TYPE)" \
    "wayland env file lacks XDG_SESSION_TYPE"
assert_eq "wayland-0" "$(read_env_value "$CALVIN_KIOSK_DISPLAY_ENV_FILE" WAYLAND_DISPLAY)" \
    "wayland env file lacks WAYLAND_DISPLAY"
assert_eq "/run/user/1000" "$(read_env_value "$CALVIN_KIOSK_DISPLAY_ENV_FILE" XDG_RUNTIME_DIR)" \
    "wayland env file lacks the computed XDG_RUNTIME_DIR"
assert_eq "--ozone-platform=wayland" \
    "$(read_env_value "$CALVIN_KIOSK_DISPLAY_ENV_FILE" CALVIN_CHROMIUM_DISPLAY_FLAGS)" \
    "wayland env file lacks the Chromium ozone flag"
assert_not_contains "$CALVIN_KIOSK_DISPLAY_ENV_FILE" '^DISPLAY=' "wayland env file still sets DISPLAY"
assert_not_contains "$CALVIN_KIOSK_DISPLAY_ENV_FILE" 'XAUTHORITY' "wayland env file still sets XAUTHORITY"
assert_contains "$SYSTEMCTL_LOG" '^enable calvin-wayland.service$' "wayland not enabled"
assert_contains "$SYSTEMCTL_LOG" '^disable calvin-x.service$' "X11 not disabled"
assert_mode "$tmp/home/calvin/.config/labwc/autostart" 755
# shellcheck disable=SC2016  # matching the literal script text
assert_contains "$tmp/home/calvin/.config/labwc/autostart" 'wlr-randr --output "\$out" --on'
assert_not_contains "$tmp/home/calvin/.config/labwc/autostart" 'chromium' \
    "autostart must not start Chromium (systemd owns it)"
assert_contains "$tmp/home/calvin/.config/labwc/rc.xml" '<autoEnableOutputs>no</autoEnableOutputs>'
assert_contains "$tmp/home/calvin/.config/labwc/rc.xml" 'name="HideCursor"'
pass "fresh wayland install writes session env, labwc config, enables one compositor"

# The generated labwc files must be byte-identical to the ones the kiosk bundle
# serves; otherwise an updated kiosk and a fresh install drift apart.
diff -u "$REPO/deploy/kiosk-agent/labwc/autostart" "$tmp/home/calvin/.config/labwc/autostart" \
    || fail "setup-generated labwc autostart differs from the bundled file"
diff -u "$REPO/deploy/kiosk-agent/labwc/rc.xml" "$tmp/home/calvin/.config/labwc/rc.xml" \
    || fail "setup-generated labwc rc.xml differs from the bundled file"
pass "labwc config matches the kiosk bundle"

# --- 4. Rolling back to X11 ---------------------------------------------------
reset_systemctl_log
apply_display_stack x11 calvin >/dev/null
assert_eq ":0" "$(read_env_value "$CALVIN_KIOSK_DISPLAY_ENV_FILE" DISPLAY)" "x11 env file lacks DISPLAY"
assert_eq "$tmp/home/calvin/.Xauthority" \
    "$(read_env_value "$CALVIN_KIOSK_DISPLAY_ENV_FILE" XAUTHORITY)" "x11 env file has the wrong XAUTHORITY"
assert_eq "" "$(read_env_value "$CALVIN_KIOSK_DISPLAY_ENV_FILE" CALVIN_CHROMIUM_DISPLAY_FLAGS)" \
    "x11 env file must define an empty Chromium flag (no ozone on X11)"
assert_not_contains "$CALVIN_KIOSK_DISPLAY_ENV_FILE" 'WAYLAND_DISPLAY' "x11 env file still sets WAYLAND_DISPLAY"
assert_not_contains "$CALVIN_KIOSK_DISPLAY_ENV_FILE" 'XDG_RUNTIME_DIR' "x11 env file still sets XDG_RUNTIME_DIR"
assert_contains "$SYSTEMCTL_LOG" '^enable calvin-x.service$' "X11 not re-enabled"
assert_contains "$SYSTEMCTL_LOG" '^disable calvin-wayland.service$' "wayland not disabled"
pass "rollback rewrites the env and flips the compositor units"

# --- 5. Idempotent in both directions ----------------------------------------
before_env="$(cat "$CALVIN_KIOSK_DISPLAY_ENV_FILE")"
before_auto="$(cat "$tmp/home/calvin/.config/labwc/autostart")"
reset_systemctl_log
apply_display_stack x11 calvin >/dev/null
assert_eq "$before_env" "$(cat "$CALVIN_KIOSK_DISPLAY_ENV_FILE")" "re-running the same stack changed the env file"
assert_eq "$before_auto" "$(cat "$tmp/home/calvin/.config/labwc/autostart")" "re-running changed labwc config"

reset_systemctl_log
apply_display_stack wayland calvin >/dev/null
assert_eq "wayland" "$(read_env_value "$CALVIN_KIOSK_DISPLAY_ENV_FILE" XDG_SESSION_TYPE)" \
    "switch back to wayland did not rewrite the env"
assert_contains "$SYSTEMCTL_LOG" '^enable calvin-wayland.service$' "switch back did not enable wayland"
assert_contains "$SYSTEMCTL_LOG" '^disable calvin-x.service$' "switch back did not disable X11"
# Exactly one compositor is ever enabled: the opposite unit is never enabled.
if grep -qx 'enable calvin-x.service' "$SYSTEMCTL_LOG"; then
    fail "switching to wayland also enabled calvin-x.service"
fi
pass "switching is idempotent in both directions"

# --- 6. /etc/default/calvin-kiosk owns the stack, and a switch keeps identity --
cat > "$CALVIN_KIOSK_ENV_FILE" <<'EOF'
# operator comments survive
CALVIN_BACKEND_URL=http://tower.local:8000
CALVIN_KIOSK_ID=kitchen-abcdef
CALVIN_KIOSK_HOSTNAME=kitchen
CALVIN_DISPLAY_ROTATION=left
CALVIN_DISPLAY_STACK=x11
EOF
# setup-kiosk.sh's own helpers (install_kiosk_config, requested_display_stack).
# shellcheck source=../setup-kiosk.sh
. "$REPO/scripts/setup-kiosk.sh" --source-only
BACKEND_URL="http://tower.local:8000"
install_kiosk_config wayland >/dev/null
assert_eq "wayland" "$(read_env_value "$CALVIN_KIOSK_ENV_FILE" CALVIN_DISPLAY_STACK)" \
    "switch did not record the new stack"
assert_eq "http://tower.local:8000" "$(read_env_value "$CALVIN_KIOSK_ENV_FILE" CALVIN_BACKEND_URL)" \
    "switch changed the server URL"
assert_eq "kitchen-abcdef" "$(read_env_value "$CALVIN_KIOSK_ENV_FILE" CALVIN_KIOSK_ID)" \
    "switch changed the kiosk id"
assert_eq "left" "$(read_env_value "$CALVIN_KIOSK_ENV_FILE" CALVIN_DISPLAY_ROTATION)" \
    "switch lost the operator's rotation setting"
assert_contains "$CALVIN_KIOSK_ENV_FILE" '^# operator comments survive' "switch dropped operator comments"
pass "switching preserves server URL, kiosk id and operator settings"

# Resolution order for a re-run: flag > environment > env file > auto.
export CALVIN_KIOSK_ENV_FILE
assert_eq "wayland" "$(requested_display_stack)" "env file stack not used when nothing else is set"
assert_eq "x11" "$(CALVIN_DISPLAY_STACK=x11 requested_display_stack)" "environment must win over the env file"
DISPLAY_STACK_ARG="wayland"
assert_eq "wayland" "$(CALVIN_DISPLAY_STACK=x11 requested_display_stack)" "--display-stack must win"
DISPLAY_STACK_ARG=""
unset CALVIN_DISPLAY_STACK
pass "stack resolution order"

echo "PASS"
