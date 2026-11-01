#!/usr/bin/env bash
# calvin-cog-panel.sh: the root half of the display agent on the cog stack.
#
# Screen OFF must stop cog first (cog holds DRM master, so nobody else can set
# DPMS while it runs), wait for the unit's MainPID to disappear (the DRM core
# restores the fbdev console when the last client closes, which would undo an
# early blank), clear tty1, and then blank fb0 with 0 followed by 4. It verifies
# the connected connectors report DPMS Off and retries once if they do not.
# Screen ON clears tty1 first, unblanks, and starts cog.
# Rotation is persisted to the env file and only restarts a running unit.
# systemctl, the framebuffer, tty1 and the DRM sysfs tree are stubbed; nothing
# here touches this machine.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
# shellcheck source=helpers/assert.sh
. "$HERE/helpers/assert.sh"
HELPER="$REPO/deploy/kiosk-agent/calvin-cog-panel.sh"

tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"
export CALVIN_COG_UNIT="calvin-cog.service"
export CALVIN_COG_ROTATION_FILE="$tmp/calvin-kiosk-cog"
export CALVIN_FB_BLANK="$tmp/fb0-blank"
export CALVIN_COG_SYSTEMCTL="$tmp/bin/systemctl"
export SYSTEMCTL_LOG="$tmp/systemctl.log"
export CALVIN_TTY="$tmp/tty1"
export CALVIN_DRM_DIR="$tmp/drm"
# Keep the wait and the retry short in the test; production defaults are 5 s/1 s.
export CALVIN_COG_POLL_INTERVAL="0.01"
export CALVIN_COG_RETRY_DELAY="0"
printf '2\n' > "$CALVIN_FB_BLANK"
: > "$CALVIN_TTY"

# Fake sysfs tree: one connected HDMI connector whose dpms we control, plus a
# disconnected connector that must be ignored.
HDMI_DIR="$CALVIN_DRM_DIR/card1-HDMI-A-2"
mkdir -p "$HDMI_DIR" "$CALVIN_DRM_DIR/card1-eDP-1"
printf 'connected\n' > "$HDMI_DIR/status"
printf 'Off\n' > "$HDMI_DIR/dpms"
printf 'disconnected\n' > "$CALVIN_DRM_DIR/card1-eDP-1/status"
printf 'On\n' > "$CALVIN_DRM_DIR/card1-eDP-1/dpms"

# The unit is stopped while the panel is blanked; is-active decides whether a
# rotation change needs a restart; show --property=MainPID is what the helper
# polls. MOCK_MAIN_PID_SEQ answers one value per call and then repeats the last,
# so a sequence like "4242 4242 0" proves the helper polled until cog was gone.
cat > "$CALVIN_COG_SYSTEMCTL" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "$SYSTEMCTL_LOG"
case "\$1" in
    is-active) exit "\${MOCK_IS_ACTIVE:-0}" ;;
    show)
        idx_file="$tmp/mainpid.idx"
        idx=\$(cat "\$idx_file" 2>/dev/null || echo 0)
        set -- \${MOCK_MAIN_PID_SEQ:-0}
        values=("\$@")
        last=\$(( \${#values[@]} - 1 ))
        [ "\$idx" -gt "\$last" ] && idx=\$last
        printf '%s\n' "\${values[\$idx]}"
        echo \$(( idx + 1 )) > "\$idx_file"
        exit 0
        ;;
esac
exit 0
EOF
chmod +x "$CALVIN_COG_SYSTEMCTL"

# A hung helper fails the test instead of hanging CI forever (a FIFO dpms node
# with no writer would block).
run() { timeout 20 bash "$HELPER" "$@" 2>&1; }
reset_mock() { rm -f "$SYSTEMCTL_LOG" "$tmp/mainpid.idx"; }
line_of() { grep -nF -- "$1" <<< "$2" | head -n 1 | cut -d: -f1; }
assert_before() {  # first second output message
    local a b
    a="$(line_of "$1" "$3")"
    b="$(line_of "$2" "$3")"
    if [ -z "$a" ] || [ -z "$b" ] || [ "$a" -ge "$b" ]; then
        fail "${4:-order assertion failed: $1 before $2}"
    fi
}

# --- 1. OFF: stop cog, wait for it to go, clear tty1, then blank 0/4 --------
reset_mock
: > "$CALVIN_TTY"
out="$(MOCK_MAIN_PID_SEQ="4242 4242 0" run off)"
assert_eq "4" "$(cat "$CALVIN_FB_BLANK")" "screen off did not blank the framebuffer (4)"
grep -qx 'stop calvin-cog.service' "$SYSTEMCTL_LOG" || fail "screen off did not stop cog"
assert_eq "3" "$(grep -c '^show ' "$SYSTEMCTL_LOG")" \
    "screen off did not poll the unit's MainPID until cog exited"
assert_before 'stop calvin-cog.service' 'blank 0' "$out" \
    "screen off blanked before stopping cog (cog holds DRM master)"
assert_before 'DRM master released' 'blank 0' "$out" \
    "screen off blanked before the stopped unit's MainPID was gone"
assert_before 'blank 0' 'blank 4' "$out" \
    "screen off did not write 0 before 4 (the console-mode restore undoes a lone 4)"
assert_before 'cleared' 'blank 0' "$out" "screen off did not clear tty1 before blanking"
assert_eq "$(printf '\033[2J\033[H\033[?25l')" "$(cat "$CALVIN_TTY")" \
    "screen off did not clear tty1 and hide the cursor"
echo "$out" | grep -q 'HDMI-A-2: dpms=Off' \
    || fail "screen off did not verify the connected connector's DPMS state"
if echo "$out" | grep -q 'eDP-1'; then
    fail "screen off checked a disconnected connector"
fi
echo "$out" | grep -q 'screen off: panel DPMS off' \
    || fail "screen off did not log the successful result"
pass "screen off stops cog, waits for DRM master release, clears tty1 and blanks 0 then 4"

# --- 2. ON: clear tty1, unblank, then start cog ------------------------------
reset_mock
: > "$CALVIN_TTY"
out="$(run on)"
assert_eq "0" "$(cat "$CALVIN_FB_BLANK")" "screen on did not unblank the framebuffer (0)"
grep -qx 'start calvin-cog.service' "$SYSTEMCTL_LOG" || fail "screen on did not start cog"
assert_before 'cleared' 'blank 0' "$out" "screen on unblanked before clearing tty1"
assert_before 'blank 0' 'start calvin-cog.service' "$out" \
    "screen on started cog before unblanking"
assert_eq "$(printf '\033[2J\033[H\033[?25l')" "$(cat "$CALVIN_TTY")" \
    "screen on did not clear tty1 (a wake must not flash the boot log)"
pass "screen on clears tty1, unblanks fb0 and starts cog in that order"

# --- 3. Rotation -------------------------------------------------------------
# No file yet -> writes 1 and restarts the running unit.
reset_mock
rm -f "$CALVIN_COG_ROTATION_FILE"
run rotate 1 >/dev/null
assert_eq "1" "$(sed -n 's/^CALVIN_COG_ROTATION=//p' "$CALVIN_COG_ROTATION_FILE")" \
    "rotate did not persist the new rotation"
grep -qx 'is-active --quiet calvin-cog.service' "$SYSTEMCTL_LOG" || fail "rotate did not check the unit"
grep -qx 'restart calvin-cog.service' "$SYSTEMCTL_LOG" || fail "rotate did not restart a running cog"
assert_mode "$CALVIN_COG_ROTATION_FILE" 644

# Same value -> no restart (a needless restart blanks the dashboard).
reset_mock
run rotate 1 >/dev/null
if grep -qx 'restart calvin-cog.service' "$SYSTEMCTL_LOG" 2>/dev/null; then
    fail "rotate restarted cog even though the rotation did not change"
fi

# Not running -> persist without starting it (the panel is off).
reset_mock
MOCK_IS_ACTIVE=3 run rotate 3 >/dev/null
assert_eq "3" "$(sed -n 's/^CALVIN_COG_ROTATION=//p' "$CALVIN_COG_ROTATION_FILE")" \
    "rotate did not persist while the unit was stopped"
if grep -qx 'restart calvin-cog.service' "$SYSTEMCTL_LOG"; then
    fail "rotate restarted a unit that was not running"
fi
pass "rotation is persisted once and only restarts a running cog"

# --- 4. Validation -----------------------------------------------------------
before="$(cat "$CALVIN_COG_ROTATION_FILE")"
if run rotate 9 >/dev/null; then fail "rotate accepted 9"; fi
if run rotate >/dev/null; then fail "rotate accepted a missing value"; fi
if run sideways >/dev/null; then fail "an unknown verb was accepted"; fi
assert_eq "$before" "$(cat "$CALVIN_COG_ROTATION_FILE")" "an invalid rotation changed the file"
pass "invalid rotation and verbs are refused"

# --- 5. No framebuffer: report, do not pretend it worked ----------------------
reset_mock
rm -f "$CALVIN_FB_BLANK"
if run off >/dev/null; then fail "screen off claimed success without a framebuffer"; fi
grep -qx 'stop calvin-cog.service' "$SYSTEMCTL_LOG" || fail "screen off skipped stopping cog"
pass "a missing framebuffer fails loudly"

# --- 6. Boot inside the off window: OFF then ON (CLV-102) ---------------------
reset_mock
printf '0\n' > "$CALVIN_FB_BLANK"
run off >/dev/null
run on >/dev/null
grep -qx 'stop calvin-cog.service' "$SYSTEMCTL_LOG" || fail "boot off did not stop cog"
grep -qx 'start calvin-cog.service' "$SYSTEMCTL_LOG" || fail "boot on did not start cog"
stop_line="$(grep -n 'stop calvin-cog.service' "$SYSTEMCTL_LOG" | cut -d: -f1)"
start_line="$(grep -n 'start calvin-cog.service' "$SYSTEMCTL_LOG" | cut -d: -f1)"
[ "$start_line" -gt "$stop_line" ] || fail "start ran before the boot off"

# A repeated ON is idempotent: start is issued again and the helper succeeds.
reset_mock
run on >/dev/null
grep -qx 'start calvin-cog.service' "$SYSTEMCTL_LOG" || fail "repeated on did not start cog"
pass "off at boot then on always starts cog"

# --- 7. ON survives a missing framebuffer ------------------------------------
# The unblank is best-effort: without fb0 the unit must still be started, or a
# kiosk that booted in the off window stays black for the rest of the day.
reset_mock
rm -f "$SYSTEMCTL_LOG" "$CALVIN_FB_BLANK"
out="$(run on 2>&1)" || fail "screen on failed when only the framebuffer was missing"
grep -qx 'start calvin-cog.service' "$SYSTEMCTL_LOG" \
    || fail "screen on skipped starting cog without a framebuffer"
echo "$out" | grep -q 'unblank failed' || fail "missing framebuffer was not reported"
printf '0\n' > "$CALVIN_FB_BLANK"
pass "screen on starts cog even when the framebuffer is missing"

# --- 8. Panel still on after the blank: retry once, then say so --------------
# The Pi 400 leaves DPMS On when the DRM core restores the console mode after
# our blank (CLV-116). One retry is enough in practice; when it still fails the
# helper must fail and log it so the agent retries on its next poll.
reset_mock
printf 'On\n' > "$HDMI_DIR/dpms"
: > "$CALVIN_TTY"
if out="$(run off)"; then fail "screen off claimed success while the panel stayed On"; fi
assert_eq "2" "$(grep -c 'blank 0' <<< "$out")" "screen off did not retry the 0 blank"
assert_eq "2" "$(grep -c 'blank 4' <<< "$out")" "screen off did not retry the 4 blank"
echo "$out" | grep -q 'retrying' || fail "screen off did not log the retry"
echo "$out" | grep -q 'still reports DPMS on' \
    || fail "screen off did not log that the panel stayed on"
assert_eq "4" "$(cat "$CALVIN_FB_BLANK")" "the retry did not leave the framebuffer blanked"
pass "screen off retries the 0/4 sequence once and fails loudly when DPMS stays On"

# --- 9. The retry succeeds: DPMS flips to Off after the second blank ---------
# A FIFO hands the helper "On" for the first check and "Off" for the second,
# i.e. the panel goes dark on the retry.
rm -f "$HDMI_DIR/dpms"
mkfifo "$HDMI_DIR/dpms"
(
    printf 'On\n' > "$HDMI_DIR/dpms"
    printf 'Off\n' > "$HDMI_DIR/dpms"
) &
writer=$!
if ! out="$(run off)"; then
    kill "$writer" 2>/dev/null || true
    fail "screen off failed although the panel went Off on the retry"
fi
kill "$writer" 2>/dev/null || true
assert_eq "2" "$(grep -c 'blank 0' <<< "$out")" "screen off did not need exactly one retry"
echo "$out" | grep -q 'screen off: panel DPMS off after retry' \
    || fail "screen off did not log the successful retry"
rm -f "$HDMI_DIR/dpms"
printf 'Off\n' > "$HDMI_DIR/dpms"
pass "screen off recovers when the panel goes Off on the retry"

echo "PASS"
