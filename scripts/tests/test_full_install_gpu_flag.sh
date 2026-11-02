#!/usr/bin/env bash
# CLV-26: the all-in-one install (scripts/setup.sh, Mode A) must give Chromium
# the same board-dependent flags as a remote kiosk (calvin-scuh, #134).
#
# On VC4-class boards (Pi 3/3B+, Zero 2 W, CM3) Chromium's GPU path crashes the
# renderer ("Aw, Snap! error 11") within seconds. setup-kiosk.sh (Mode B) fixed
# that by writing CALVIN_CHROMIUM_DISPLAY_FLAGS into the session env file;
# calvin-kiosk.service (Mode A) hard-coded its flags and never read that file, so
# the crashing GPU path stayed on. The FULL unit now reads the file and setup.sh
# writes it from the shared setup-common.sh detection (CALVIN_CHROMIUM_GPU).
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
export CALVIN_DEVICE_TREE_MODEL="$tmp/model"
export CALVIN_SUDOERS_DIR="$tmp/sudoers.d" CALVIN_POLKIT_DIR="$tmp/polkit"
export CALVIN_HOME_OVERRIDE="$tmp/home"
mkdir -p "$tmp/home/calvin" "$tmp/bin"
B="$tmp/bin"
export SYSTEMCTL_LOG="$tmp/systemctl.log"
make_stub "$B" chown ":"
make_stub "$B" systemctl "echo \"\$*\" >> \"\$SYSTEMCTL_LOG\""
make_stub "$B" docker "exit 0"
make_stub "$B" apt-get ":"
make_stub "$B" git ":"
make_stub "$B" visudo "exit 0"
export CALVIN_VISUDO="$B/visudo"
PATH="$B:$PATH"

# --- 1. The FULL kiosk unit reads the session env, like the remote one -------
unit="$REPO/deploy/systemd/calvin-kiosk.service"
assert_contains "$unit" '^EnvironmentFile=-/etc/calvin/\.env$' \
    "calvin-kiosk.service no longer reads /etc/calvin/.env"
assert_contains "$unit" '^EnvironmentFile=-/etc/default/calvin-kiosk-display$' \
    "calvin-kiosk.service does not read the session env file (the remote unit does)"
# shellcheck disable=SC2016  # matching the literal unit text
grep -qF -- '$${CALVIN_CHROMIUM_DISPLAY_FLAGS:-}' "$unit" \
    || fail "calvin-kiosk.service does not pass CALVIN_CHROMIUM_DISPLAY_FLAGS to Chromium"
# Only the Exec lines matter: a comment may mention the flag.
exec_text="$(awk '
    /^Exec[A-Za-z]*=/ { inexec = 1 }
    inexec { print; if ($0 !~ /\\$/) inexec = 0 }
' "$unit")"
if printf '%s\n' "$exec_text" | grep -qE -- '--disable-gpu'; then
    fail "calvin-kiosk.service hard-codes --disable-gpu instead of reading the board setting"
fi
# The flag list must sit with the other arguments, before --kiosk, so it cannot
# swallow the URL.
# shellcheck disable=SC2016  # matching the literal unit text
flags_line="$(grep -nF -- '$${CALVIN_CHROMIUM_DISPLAY_FLAGS:-}' "$unit" | cut -d: -f1)"
kiosk_line="$(grep -n -- '--kiosk' "$unit" | head -n 1 | cut -d: -f1)"
if [ -z "$flags_line" ] || [ "$flags_line" -ge "$kiosk_line" ]; then
    fail "calvin-kiosk.service must pass the flags before --kiosk"
fi
pass "calvin-kiosk.service reads CALVIN_CHROMIUM_DISPLAY_FLAGS from the session env"

# --- 2. Source setup.sh (Mode A) and fake the board --------------------------
# shellcheck source=../setup.sh
. "$HERE/../setup.sh" --source-only
CALVIN_DIR="$REPO"; CALVIN_SOURCE_DIR="$REPO"; GIT_BRANCH=develop; SETUP_MODE=prod

set_model() { printf '%s\0' "$1" > "$CALVIN_DEVICE_TREE_MODEL"; }
display_flags() {
    read_env_value "$CALVIN_KIOSK_DISPLAY_ENV_FILE" CALVIN_CHROMIUM_DISPLAY_FLAGS
}

# --- 3. FULL install on a Pi 3B+ (the crash case) ----------------------------
# A Mode A host has no session env file at all before this fix, so this also
# covers the upgrade path. The unit is already installed and the kiosk is running
# the old (empty) flag list, so the refresh must restart it.
set_model "Raspberry Pi 3 Model B Plus Rev 1.3"
mkdir -p "$CALVIN_SYSTEMD_DIR" "$(dirname "$CALVIN_KIOSK_DISPLAY_ENV_FILE")"
: > "$CALVIN_SYSTEMD_DIR/calvin-kiosk.service"
printf 'DISPLAY=:0\nCALVIN_CHROMIUM_DISPLAY_FLAGS=\n' > "$CALVIN_KIOSK_DISPLAY_ENV_FILE"
refresh_host_files >/dev/null
assert_eq "--disable-gpu" "$(display_flags)" \
    "a Pi 3B+ FULL install must pass --disable-gpu"
assert_eq ":0" "$(read_env_value "$CALVIN_KIOSK_DISPLAY_ENV_FILE" DISPLAY)" \
    "the session env lost DISPLAY"
assert_eq "$tmp/home/calvin/.Xauthority" \
    "$(read_env_value "$CALVIN_KIOSK_DISPLAY_ENV_FILE" XAUTHORITY)" \
    "the session env lost XAUTHORITY"
assert_eq "auto" "$(read_env_value "$CALVIN_KIOSK_ENV_FILE" CALVIN_CHROMIUM_GPU)" \
    "the FULL install did not record CALVIN_CHROMIUM_GPU=auto"
cmp -s "$unit" "$CALVIN_SYSTEMD_DIR/calvin-kiosk.service" \
    || fail "refresh did not install the updated kiosk unit"
assert_contains "$SYSTEMCTL_LOG" '^try-restart calvin-kiosk\.service$' \
    "a changed Chromium flag must restart the FULL kiosk unit"
pass "FULL install on a Pi 3B+ writes --disable-gpu and restarts the kiosk"

# An unchanged flag must not restart Chromium again.
rm -f "$SYSTEMCTL_LOG"
refresh_host_files >/dev/null
assert_not_contains "$SYSTEMCTL_LOG" '^try-restart calvin-kiosk\.service$' \
    "a refresh with unchanged flags restarted the kiosk"
pass "a refresh with unchanged flags leaves the kiosk alone"

# --- 4. Pi 4 keeps the GPU, and a stale flag is removed ----------------------
set_model "Raspberry Pi 4 Model B Rev 1.4"
printf 'DISPLAY=:0\nCALVIN_CHROMIUM_DISPLAY_FLAGS=--disable-gpu\n' \
    > "$CALVIN_KIOSK_DISPLAY_ENV_FILE"
configure_kiosk_display_session >/dev/null
assert_eq "" "$(display_flags)" \
    "a Pi 4 FULL install must keep the GPU path (stale --disable-gpu not removed)"
pass "Pi 4 keeps the GPU path"

# --- 5. CALVIN_CHROMIUM_GPU override ----------------------------------------
set_model "Raspberry Pi 3 Model B Plus Rev 1.3"
CALVIN_CHROMIUM_GPU=on configure_kiosk_display_session >/dev/null
assert_eq "" "$(display_flags)" "CALVIN_CHROMIUM_GPU=on must keep the GPU on a Pi 3"

set_model "Raspberry Pi 4 Model B Rev 1.4"
CALVIN_CHROMIUM_GPU=off configure_kiosk_display_session >/dev/null
assert_eq "--disable-gpu" "$(display_flags)" \
    "CALVIN_CHROMIUM_GPU=off must disable the GPU on any board"

if CALVIN_CHROMIUM_GPU=bogus configure_kiosk_display_session >/dev/null 2>&1; then
    fail "invalid CALVIN_CHROMIUM_GPU accepted by the FULL install"
fi
pass "CALVIN_CHROMIUM_GPU=on/off override the board detection"

# The setting also lives in /etc/default/calvin-kiosk; a re-run keeps it.
upsert_env_value "$CALVIN_KIOSK_ENV_FILE" CALVIN_CHROMIUM_GPU "off"
set_model "Raspberry Pi 4 Model B Rev 1.4"
configure_kiosk_display_session >/dev/null
assert_eq "--disable-gpu" "$(display_flags)" \
    "CALVIN_CHROMIUM_GPU=off in the kiosk config is ignored by the FULL install"
assert_eq "1" "$(grep -c '^CALVIN_CHROMIUM_GPU=' "$CALVIN_KIOSK_ENV_FILE")" \
    "the FULL install duplicated CALVIN_CHROMIUM_GPU"
pass "an operator override in /etc/default/calvin-kiosk survives a re-run"

# --- 6. Re-running must not duplicate the flags -----------------------------
upsert_env_value "$CALVIN_KIOSK_ENV_FILE" CALVIN_CHROMIUM_GPU "auto"
set_model "Raspberry Pi 3 Model B Plus Rev 1.3"
configure_kiosk_display_session >/dev/null
before="$(cat "$CALVIN_KIOSK_DISPLAY_ENV_FILE")"
configure_kiosk_display_session >/dev/null
assert_eq "$before" "$(cat "$CALVIN_KIOSK_DISPLAY_ENV_FILE")" \
    "re-running the FULL install changed the session env"
assert_eq "1" "$(grep -c '^CALVIN_CHROMIUM_DISPLAY_FLAGS=' "$CALVIN_KIOSK_DISPLAY_ENV_FILE")" \
    "re-running duplicated the flags line"
assert_eq "1" "$(grep -c -- '--disable-gpu' "$CALVIN_KIOSK_DISPLAY_ENV_FILE")" \
    "re-running duplicated --disable-gpu"
pass "re-running keeps exactly one flags line"

echo "PASS"
