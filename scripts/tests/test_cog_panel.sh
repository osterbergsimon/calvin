#!/usr/bin/env bash
# calvin-cog-panel.sh: the root half of the display agent on the cog stack.
#
# Screen OFF must stop cog first (cog holds DRM master, so nobody else can set
# DPMS while it runs) and then blank fb0; screen ON unblanks first and starts cog.
# Rotation is persisted to the env file and only restarts a running unit.
# systemctl and the framebuffer are stubbed; nothing here touches this machine.
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
printf '2\n' > "$CALVIN_FB_BLANK"

# The unit is stopped while the panel is blanked, and is-active decides whether a
# rotation change needs a restart.
cat > "$CALVIN_COG_SYSTEMCTL" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "$SYSTEMCTL_LOG"
[ "\$1" = "is-active" ] && exit "\${MOCK_IS_ACTIVE:-0}"
exit 0
EOF
chmod +x "$CALVIN_COG_SYSTEMCTL"

run() { bash "$HELPER" "$@" 2>&1; }

# --- 1. OFF: stop cog, then blank fb0 ----------------------------------------
out="$(run off)"
assert_eq "4" "$(cat "$CALVIN_FB_BLANK")" "screen off did not blank the framebuffer (4)"
grep -qx 'stop calvin-cog.service' "$SYSTEMCTL_LOG" || fail "screen off did not stop cog"
stop_line="$(grep -n 'stop calvin-cog.service' <<< "$out" | cut -d: -f1)"
blank_line="$(grep -n 'blank 4' <<< "$out" | cut -d: -f1)"
[ "$blank_line" -gt "$stop_line" ] || fail "screen off blanked before stopping cog (cog holds DRM master)"
pass "screen off stops cog before blanking fb0"

# --- 2. ON: unblank, then start cog ------------------------------------------
rm -f "$SYSTEMCTL_LOG"
out="$(run on)"
assert_eq "0" "$(cat "$CALVIN_FB_BLANK")" "screen on did not unblank the framebuffer (0)"
grep -qx 'start calvin-cog.service' "$SYSTEMCTL_LOG" || fail "screen on did not start cog"
blank_line="$(grep -n 'blank 0' <<< "$out" | cut -d: -f1)"
start_line="$(grep -n 'start calvin-cog.service' <<< "$out" | cut -d: -f1)"
[ "$start_line" -gt "$blank_line" ] || fail "screen on started cog before unblanking"
pass "screen on unblanks fb0 before starting cog"

# --- 3. Rotation -------------------------------------------------------------
# No file yet -> writes 1 and restarts the running unit.
rm -f "$SYSTEMCTL_LOG" "$CALVIN_COG_ROTATION_FILE"
run rotate 1 >/dev/null
assert_eq "1" "$(sed -n 's/^CALVIN_COG_ROTATION=//p' "$CALVIN_COG_ROTATION_FILE")" \
    "rotate did not persist the new rotation"
grep -qx 'is-active --quiet calvin-cog.service' "$SYSTEMCTL_LOG" || fail "rotate did not check the unit"
grep -qx 'restart calvin-cog.service' "$SYSTEMCTL_LOG" || fail "rotate did not restart a running cog"
assert_mode "$CALVIN_COG_ROTATION_FILE" 644

# Same value -> no restart (a needless restart blanks the dashboard).
rm -f "$SYSTEMCTL_LOG"
run rotate 1 >/dev/null
if grep -qx 'restart calvin-cog.service' "$SYSTEMCTL_LOG" 2>/dev/null; then
    fail "rotate restarted cog even though the rotation did not change"
fi

# Not running -> persist without starting it (the panel is off).
rm -f "$SYSTEMCTL_LOG"
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
rm -f "$CALVIN_FB_BLANK"
if run off >/dev/null; then fail "screen off claimed success without a framebuffer"; fi
grep -qx 'stop calvin-cog.service' "$SYSTEMCTL_LOG" || fail "screen off skipped stopping cog"
pass "a missing framebuffer fails loudly"

echo "PASS"
