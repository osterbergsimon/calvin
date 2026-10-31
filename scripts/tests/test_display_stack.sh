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
export CALVIN_KIOSK_COG_ENV_FILE="$tmp/calvin-kiosk-cog"
export SYSTEMCTL_LOG="$tmp/systemctl.log"
make_stub "$tmp/bin" systemctl "echo \"\$*\" >> \"\${SYSTEMCTL_LOG}\""
make_stub "$tmp/bin" chown ":"
# shellcheck disable=SC2016  # literal stub body
make_stub "$tmp/bin" id 'if [ "${1:-}" = "-u" ]; then echo 1000; exit 0; fi; exit 1'
PATH="$tmp/bin:$PATH"

# shellcheck source=../setup-common.sh
. "$REPO/scripts/setup-common.sh"

reset_systemctl_log() { rm -f "$SYSTEMCTL_LOG"; }

# Fake board model files: the device-tree model is NUL-terminated on a real Pi.
model_file() {  # $1 name, $2 model string
    printf '%s\0' "$2" > "$tmp/model-$1"
    printf '%s\n' "$tmp/model-$1"
}
PI4_MODEL="$(model_file pi4 'Raspberry Pi 4 Model B Rev 1.4')"
PI3_MODEL="$(model_file pi3 'Raspberry Pi 3 Model B Plus Rev 1.3')"
PI3A_MODEL="$(model_file pi3a 'Raspberry Pi 3 Model A Plus Rev 1.0')"
ZERO2_MODEL="$(model_file zero2 'Raspberry Pi Zero 2 W Rev 1.0')"
CM3_MODEL="$(model_file cm3 'Compute Module 3 Rev 1.0')"

# --- 1. Selection -------------------------------------------------------------
# auto is x11 off the Pi 3 class and cog on it (the same VC4-class detection that
# drives --disable-gpu). An explicit stack always wins.
export CALVIN_DEVICE_TREE_MODEL="$PI4_MODEL"
assert_eq "x11" "$(CALVIN_DISPLAY_STACK=auto resolve_display_stack)" "auto must mean x11 on a Pi 4"
assert_eq "x11" "$(unset CALVIN_DISPLAY_STACK; resolve_display_stack)" "unset must mean x11 on a Pi 4"
assert_eq "wayland" "$(CALVIN_DISPLAY_STACK=wayland resolve_display_stack)" "env override ignored"
assert_eq "cog" "$(CALVIN_DISPLAY_STACK=cog resolve_display_stack)" "cog env override ignored"
assert_eq "x11" "$(CALVIN_DISPLAY_STACK=wayland resolve_display_stack x11)" "--display-stack must win over env"
assert_eq "wayland" "$(CALVIN_DISPLAY_STACK=x11 resolve_display_stack wayland)" "--display-stack must win over env"
assert_eq "cog" "$(CALVIN_DISPLAY_STACK=x11 resolve_display_stack cog)" "--display-stack cog must win over env"

# Pi 3-class boards (VC4) auto-select cog instead of X11.
for model in "$PI3_MODEL" "$PI3A_MODEL" "$ZERO2_MODEL" "$CM3_MODEL"; do
    assert_eq "cog" "$(CALVIN_DEVICE_TREE_MODEL="$model" CALVIN_DISPLAY_STACK=auto resolve_display_stack)" \
        "auto must mean cog on Pi 3-class (${model##*/})"
done
assert_eq "x11" "$(CALVIN_DISPLAY_STACK=auto CALVIN_DEVICE_TREE_MODEL="$PI3_MODEL" resolve_display_stack x11)" \
    "an explicit x11 must win over auto on a Pi 3-class board"
assert_eq "wayland" "$(CALVIN_DISPLAY_STACK=auto CALVIN_DEVICE_TREE_MODEL="$PI3_MODEL" resolve_display_stack wayland)" \
    "an explicit wayland must win over auto on a Pi 3-class board"
assert_eq "x11" "$(CALVIN_DISPLAY_STACK=x11 CALVIN_DEVICE_TREE_MODEL="$PI3_MODEL" resolve_display_stack)" \
    "an explicit CALVIN_DISPLAY_STACK=x11 must win on a Pi 3-class board"
# A missing device-tree file (non-Pi host) stays x11.
assert_eq "x11" "$(CALVIN_DEVICE_TREE_MODEL="$tmp/nope" CALVIN_DISPLAY_STACK=auto resolve_display_stack)" \
    "auto must mean x11 when the board is unknown"
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
cog_pkgs="$(display_stack_packages cog)"
echo "$cog_pkgs" | grep -qx "cog" || fail "cog package set is missing cog"
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
assert_contains "$SYSTEMCTL_LOG" '^disable calvin-cog.service$' "cog not disabled on wayland"
assert_contains "$SYSTEMCTL_LOG" '^enable calvin-kiosk-remote.service$' "Chromium not enabled on wayland"
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
assert_contains "$SYSTEMCTL_LOG" '^enable calvin-kiosk-remote.service$' "Chromium not re-enabled on x11"
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

# --- 5b. The cog stack -------------------------------------------------------
# cog owns DRM/KMS itself: no X/Wayland session env, Chromium must stay off, and
# the rotation file is seeded once (the agent's helper keeps its value later).
reset_systemctl_log
rm -f "$CALVIN_KIOSK_DISPLAY_ENV_FILE"
apply_display_stack cog calvin >/dev/null
assert_contains "$SYSTEMCTL_LOG" '^enable calvin-cog.service$' "cog not enabled"
assert_contains "$SYSTEMCTL_LOG" '^disable calvin-x.service$' "X11 not disabled on cog"
assert_contains "$SYSTEMCTL_LOG" '^disable calvin-wayland.service$' "wayland not disabled on cog"
assert_contains "$SYSTEMCTL_LOG" '^disable calvin-kiosk-remote.service$' "Chromium not disabled on cog"
if grep -qx 'enable calvin-kiosk-remote.service' "$SYSTEMCTL_LOG"; then
    fail "Chromium enabled on the cog stack (no X/Wayland session exists there)"
fi
assert_not_contains "$CALVIN_KIOSK_DISPLAY_ENV_FILE" '^DISPLAY=' "cog env file sets DISPLAY"
assert_not_contains "$CALVIN_KIOSK_DISPLAY_ENV_FILE" '^WAYLAND_DISPLAY=' "cog env file sets WAYLAND_DISPLAY"
assert_eq "0" "$(read_env_value "$CALVIN_KIOSK_COG_ENV_FILE" CALVIN_COG_ROTATION)" \
    "cog rotation file was not seeded with 0"
assert_mode "$CALVIN_KIOSK_COG_ENV_FILE" 644

# A persisted rotation (the agent's live setting) survives a setup re-run.
printf 'CALVIN_COG_ROTATION=2\n' > "$CALVIN_KIOSK_COG_ENV_FILE"
apply_display_stack cog calvin >/dev/null
assert_eq "2" "$(read_env_value "$CALVIN_KIOSK_COG_ENV_FILE" CALVIN_COG_ROTATION)" \
    "setup clobbered the persisted cog rotation"

# ... and switching back re-enables Chromium.
reset_systemctl_log
apply_display_stack x11 calvin >/dev/null
assert_contains "$SYSTEMCTL_LOG" '^enable calvin-x.service$' "X11 not re-enabled after cog"
assert_contains "$SYSTEMCTL_LOG" '^disable calvin-cog.service$' "cog not disabled after switching to x11"
assert_contains "$SYSTEMCTL_LOG" '^enable calvin-kiosk-remote.service$' "Chromium not re-enabled after cog"
pass "cog stack owns the display, keeps Chromium off, and rolls back to x11"

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

# --- 7. A re-run keeps an existing kiosk's recorded stack ----------------------
# setup records the resolved stack, so re-running on a Pi 3-class board must not
# flip an existing x11 kiosk to cog; only a fresh install auto-selects.
export CALVIN_KIOSK_ENV_FILE="$tmp/calvin-kiosk-existing"
printf 'CALVIN_DISPLAY_STACK=x11\n' > "$CALVIN_KIOSK_ENV_FILE"
assert_eq "x11" "$(CALVIN_DEVICE_TREE_MODEL="$PI3_MODEL" requested_display_stack)" \
    "a re-run on a Pi 3-class board must keep the recorded x11 stack"
printf 'CALVIN_DISPLAY_STACK=cog\n' > "$CALVIN_KIOSK_ENV_FILE"
assert_eq "cog" "$(CALVIN_DEVICE_TREE_MODEL="$PI4_MODEL" requested_display_stack)" \
    "a re-run on a Pi 4 must keep the recorded cog stack"

# A kiosk installed before the setting existed was X11; the auto mapping must not
# migrate it behind the operator's back on a re-run.
printf 'CALVIN_BACKEND_URL=http://tower.local:8000\n' > "$CALVIN_KIOSK_ENV_FILE"
assert_eq "x11" "$(CALVIN_DEVICE_TREE_MODEL="$PI3_MODEL" requested_display_stack)" \
    "a legacy X11 kiosk must stay on x11 on a Pi 3-class board"

# A fresh install (no config file yet) auto-selects cog on the Pi 3 class ...
rm -f "$CALVIN_KIOSK_ENV_FILE"
CALVIN_DEVICE_TREE_MODEL="$PI3_MODEL"
export CALVIN_DEVICE_TREE_MODEL
assert_eq "cog" "$(requested_display_stack)" "a fresh Pi 3-class install must auto-select cog"
install_kiosk_config "$(requested_display_stack)" >/dev/null
assert_eq "cog" "$(read_env_value "$CALVIN_KIOSK_ENV_FILE" CALVIN_DISPLAY_STACK)" \
    "the fresh Pi 3-class install did not record cog"

# ... and a second run keeps it (idempotent), while an explicit flag still wins.
install_kiosk_config "$(requested_display_stack)" >/dev/null
assert_eq "cog" "$(read_env_value "$CALVIN_KIOSK_ENV_FILE" CALVIN_DISPLAY_STACK)" \
    "the second run changed the recorded cog stack"
DISPLAY_STACK_ARG="x11"
assert_eq "x11" "$(requested_display_stack)" "--display-stack must switch an existing kiosk"
DISPLAY_STACK_ARG=""
pass "a re-run keeps the existing stack"

echo "PASS"
