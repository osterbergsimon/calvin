#!/usr/bin/env bash
# Chromium's GPU path on VC4-class boards (calvin-scuh).
#
# A Pi 3/3B+, Zero 2 W or CM3 (Broadcom VC4, OpenGL ES 2.0) crashes Chromium's
# renderer with "Aw, Snap! error 11" within seconds unless --disable-gpu is set.
# The installer must add that flag on those boards only, for BOTH display stacks,
# honour CALVIN_CHROMIUM_GPU=auto|on|off, and stay idempotent across re-runs.
# /proc/device-tree/model is faked through CALVIN_DEVICE_TREE_MODEL.
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
export CALVIN_DEVICE_TREE_MODEL="$tmp/model"
export SYSTEMCTL_LOG="$tmp/systemctl.log"
make_stub "$tmp/bin" systemctl "echo \"\$*\" >> \"\${SYSTEMCTL_LOG}\""
make_stub "$tmp/bin" chown ":"
# shellcheck disable=SC2016  # literal stub body
make_stub "$tmp/bin" id 'if [ "${1:-}" = "-u" ]; then echo 1000; exit 0; fi; exit 1'
PATH="$tmp/bin:$PATH"

# shellcheck source=../setup-common.sh
. "$REPO/scripts/setup-common.sh"

# A real device-tree model file is NUL-terminated; write the same shape.
set_model() { printf '%s\0' "$1" > "$CALVIN_DEVICE_TREE_MODEL"; }
flags() { read_env_value "$CALVIN_KIOSK_DISPLAY_ENV_FILE" CALVIN_CHROMIUM_DISPLAY_FLAGS; }

# --- 1. Pi 3B+ (VC4): no GPU path on either stack -----------------------------
set_model "Raspberry Pi 3 Model B Plus Rev 1.3"
apply_display_stack x11 calvin >/dev/null
assert_eq "--disable-gpu" "$(flags)" "Pi 3B+ X11 must pass --disable-gpu"
apply_display_stack wayland calvin >/dev/null
assert_eq "--ozone-platform=wayland --disable-gpu" "$(flags)" \
    "Pi 3B+ Wayland must keep the ozone flag and append --disable-gpu"
pass "Pi 3B+ disables the GPU path on both stacks"

# --- 2. Other VC4-class boards -------------------------------------------------
for model in "Raspberry Pi Zero 2 W Rev 1.0" "Raspberry Pi Compute Module 3 Rev 1.0"; do
    set_model "$model"
    apply_display_stack x11 calvin >/dev/null
    assert_eq "--disable-gpu" "$(flags)" "$model is VC4-class and must disable the GPU"
done
pass "Zero 2 W and CM3 are detected as VC4-class"

# --- 3. Pi 4 and Pi 5 keep the GPU --------------------------------------------
for model in "Raspberry Pi 4 Model B Rev 1.4" "Raspberry Pi 5 Model B Rev 1.0"; do
    set_model "$model"
    apply_display_stack x11 calvin >/dev/null
    assert_eq "" "$(flags)" "$model X11 must keep the GPU"
    apply_display_stack wayland calvin >/dev/null
    assert_eq "--ozone-platform=wayland" "$(flags)" "$model Wayland must keep the GPU"
done
pass "Pi 4 and Pi 5 keep the GPU path"

# No device-tree model at all (non-Pi host, CI): unknown is not VC4.
rm -f "$CALVIN_DEVICE_TREE_MODEL"
apply_display_stack x11 calvin >/dev/null
assert_eq "" "$(flags)" "an unknown board must keep the GPU"
pass "unknown boards keep the GPU path"

# --- 4. CALVIN_CHROMIUM_GPU override ------------------------------------------
set_model "Raspberry Pi 3 Model B Plus Rev 1.3"
CALVIN_CHROMIUM_GPU=on apply_display_stack x11 calvin >/dev/null
assert_eq "" "$(flags)" "CALVIN_CHROMIUM_GPU=on must keep the GPU on a Pi 3"
CALVIN_CHROMIUM_GPU=on apply_display_stack wayland calvin >/dev/null
assert_eq "--ozone-platform=wayland" "$(flags)" \
    "CALVIN_CHROMIUM_GPU=on must keep the ozone flag alone on Wayland"

set_model "Raspberry Pi 4 Model B Rev 1.4"
CALVIN_CHROMIUM_GPU=off apply_display_stack x11 calvin >/dev/null
assert_eq "--disable-gpu" "$(flags)" "CALVIN_CHROMIUM_GPU=off must disable the GPU on any board"

if err="$(CALVIN_CHROMIUM_GPU=bogus resolve_chromium_gpu 2>&1)"; then
    fail "invalid CALVIN_CHROMIUM_GPU accepted"
fi
echo "$err" | grep -q 'Invalid CALVIN_CHROMIUM_GPU' || fail "unclear error for a bad setting: $err"
pass "CALVIN_CHROMIUM_GPU=on/off overrides the board detection"

# The setting also lives in /etc/default/calvin-kiosk; the environment wins.
set_model "Raspberry Pi 3 Model B Plus Rev 1.3"
upsert_env_value "$CALVIN_KIOSK_ENV_FILE" CALVIN_CHROMIUM_GPU "on"
apply_display_stack x11 calvin >/dev/null
assert_eq "" "$(flags)" "CALVIN_CHROMIUM_GPU=on in the kiosk config must keep the GPU"
CALVIN_CHROMIUM_GPU=off apply_display_stack x11 calvin >/dev/null
assert_eq "--disable-gpu" "$(flags)" "the environment must win over the kiosk config file"
rm -f "$CALVIN_KIOSK_ENV_FILE"
pass "the setting comes from the environment, then the kiosk config"

# --- 5. Re-running must not duplicate the flag ---------------------------------
set_model "Raspberry Pi 3 Model B Plus Rev 1.3"
apply_display_stack wayland calvin >/dev/null
first_env="$(cat "$CALVIN_KIOSK_DISPLAY_ENV_FILE")"
apply_display_stack wayland calvin >/dev/null
assert_eq "$first_env" "$(cat "$CALVIN_KIOSK_DISPLAY_ENV_FILE")" \
    "re-running the same stack rewrote the session env"
assert_eq "1" "$(grep -c -- '--disable-gpu' "$CALVIN_KIOSK_DISPLAY_ENV_FILE")" \
    "re-running duplicated --disable-gpu"
assert_eq "1" "$(grep -c -- '--ozone-platform=wayland' "$CALVIN_KIOSK_DISPLAY_ENV_FILE")" \
    "re-running duplicated --ozone-platform=wayland"
# Switching stacks keeps exactly one copy of each flag.
apply_display_stack x11 calvin >/dev/null
assert_eq "--disable-gpu" "$(flags)" "switching to X11 lost the GPU flag"
assert_eq "1" "$(grep -c -- '--disable-gpu' "$CALVIN_KIOSK_DISPLAY_ENV_FILE")" \
    "switching to X11 duplicated --disable-gpu"
pass "re-running and switching stacks keep one copy of the flag"

# --- 6. The installer records the default and keeps an override ----------------
# setup-kiosk.sh's own install_kiosk_config().
# shellcheck source=../setup-kiosk.sh
. "$REPO/scripts/setup-kiosk.sh" --source-only
BACKEND_URL="http://tower.local:8000"
install_kiosk_config x11 >/dev/null
assert_eq "auto" "$(read_env_value "$CALVIN_KIOSK_ENV_FILE" CALVIN_CHROMIUM_GPU)" \
    "the installer did not record CALVIN_CHROMIUM_GPU=auto"
upsert_env_value "$CALVIN_KIOSK_ENV_FILE" CALVIN_CHROMIUM_GPU "off"
install_kiosk_config x11 >/dev/null
assert_eq "off" "$(read_env_value "$CALVIN_KIOSK_ENV_FILE" CALVIN_CHROMIUM_GPU)" \
    "the installer overwrote the operator's CALVIN_CHROMIUM_GPU"
assert_eq "1" "$(grep -c '^CALVIN_CHROMIUM_GPU=' "$CALVIN_KIOSK_ENV_FILE")" \
    "the installer duplicated CALVIN_CHROMIUM_GPU"
pass "the installer records the GPU default without clobbering an override"

echo "PASS"
