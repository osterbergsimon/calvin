#!/usr/bin/env bash
# Calvin cog panel helper — the root half of the display agent on the cog stack.
#
# cog owns DRM master, so nobody else can set DPMS while it runs: screen-off is
# "stop cog, then start calvin-drm-hold.service", which takes DRM master and
# disables the CRTCs; screen-on is "stop the holder, unblank, start cog".
# Without a master, a monitor that pulses hotplug in standby makes the kernel's
# fbdev client relight the panel (calvin-e8ze). Where the holder is not
# installed, or fails, screen-off blanks the framebuffer instead.
# Rotation is a cog startup property (`--platform-params=renderer=gles,rotation=N`),
# so a change is written to /etc/default/calvin-kiosk-cog and applied by
# restarting the unit.
#
# Installed root-owned at /usr/local/bin/calvin-cog-panel.sh; the calvin user may
# run only this helper through sudo (deploy/kiosk-agent/calvin-kiosk-cog.sudoers
# content, installed by setup-kiosk.sh). Args are validated here so the sudoers
# wildcard for `rotate` cannot smuggle anything else.
#
# The framebuffer, tty and DRM sysfs paths are overridable so the shell test can
# point them at a throwaway tree; on a kiosk the defaults are always used.
set -euo pipefail

UNIT="${CALVIN_COG_UNIT:-calvin-cog.service}"
HOLD_UNIT="${CALVIN_DRM_HOLD_UNIT:-calvin-drm-hold.service}"
ROTATION_FILE="${CALVIN_COG_ROTATION_FILE:-/etc/default/calvin-kiosk-cog}"
FB_BLANK="${CALVIN_FB_BLANK:-/sys/class/graphics/fb0/blank}"
DRM_DIR="${CALVIN_DRM_DIR:-/sys/class/drm}"
TTY="${CALVIN_TTY:-/dev/tty1}"
SYSTEMCTL="${CALVIN_COG_SYSTEMCTL:-systemctl}"
STOP_TIMEOUT="${CALVIN_COG_STOP_TIMEOUT:-5}"
POLL_INTERVAL="${CALVIN_COG_POLL_INTERVAL:-0.2}"
RETRY_DELAY="${CALVIN_COG_RETRY_DELAY:-1}"

log() { printf '[calvin-cog-panel] %s\n' "$*" >&2; }
die() { log "ERROR: $*"; exit 2; }
usage() { echo "Usage: $0 off|on|rotate 0|1|2|3" >&2; exit 2; }

blank() {  # 0 = unblank, 4 = power down (DPMS off)
    local value="$1"
    if [ ! -e "$FB_BLANK" ]; then
        log "no $FB_BLANK; cannot change panel power (cog not on a framebuffer console?)"
        return 1
    fi
    log "blank ${value} -> ${FB_BLANK}"
    printf '%s\n' "${value}" > "$FB_BLANK"
}

# Clear the console, home the cursor and hide it. The DRM core repaints the
# stale fbdev contents (the boot log) when cog closes, so an off that does not
# clear tty1 looks "stuck in boot"; on wake an uncleared console flashes it.
clear_console() {
    if [ -w "$TTY" ]; then
        printf '\033[2J\033[H\033[?25l' > "$TTY" || true
        log "cleared ${TTY} and hid the cursor"
    else
        log "cannot clear ${TTY} (not writable); continuing"
    fi
}

# The kernel restores the fbdev console mode when the last DRM client closes.
# A blank issued while cog still holds master is undone a moment later (DPMS
# back On, tty1 repainted), so wait for the unit's MainPID to disappear.
wait_for_master_release() {
    local pid deadline
    deadline=$((SECONDS + STOP_TIMEOUT))
    while :; do
        pid="$("$SYSTEMCTL" show --property=MainPID --value "$UNIT" 2>/dev/null \
            | tr -d '[:space:]' || true)"
        if [ -z "$pid" ] || [ "$pid" = "0" ]; then
            log "${UNIT} stopped; DRM master released"
            return 0
        fi
        if [ "$SECONDS" -ge "$deadline" ]; then
            log "${UNIT} still running (MainPID ${pid}) after ${STOP_TIMEOUT}s; blanking anyway"
            return 1
        fi
        sleep "$POLL_INTERVAL"
    done
}

# 0 then 4: the unblank discards the DRM console-mode restore, then the panel
# powers down for good. A lone 4 can be undone by that restore (CLV-116).
blank_cycle() {
    blank 0 || true
    blank 4
}

# Succeed only when every connected connector's DPMS node reads Off. Connectors
# without a dpms node (or with no connected connector at all) are skipped: there
# is nothing to verify then, not a failure.
dpms_is_off() {
    local dir state connected=0 failures=0
    for dir in "$DRM_DIR"/*/; do
        [ -r "${dir}status" ] || continue
        [ "$(cat "${dir}status" 2>/dev/null || true)" = "connected" ] || continue
        [ -r "${dir}dpms" ] || continue
        connected=$((connected + 1))
        state="$(cat "${dir}dpms" 2>/dev/null || true)"
        log "$(basename "$dir"): dpms=${state:-unknown}"
        [ "$state" = "Off" ] || failures=$((failures + 1))
    done
    if [ "$connected" -eq 0 ]; then
        log "no connected DRM connector under ${DRM_DIR}; cannot verify DPMS"
        return 0
    fi
    [ "$failures" -eq 0 ]
}

holder_installed() { "$SYSTEMCTL" cat "$HOLD_UNIT" >/dev/null 2>&1; }

# Also cancels a pending automatic restart. Dropping master makes the kernel
# restore the console mode.
stop_holder() {
    log "stop ${HOLD_UNIT}"
    "$SYSTEMCTL" stop "$HOLD_UNIT" || log "stop ${HOLD_UNIT} failed; continuing"
}

# Screen off with the holder: it returns from start only once the CRTCs are off.
# fb blank writes are ignored while it holds master, so none are made here.
off_with_holder() {
    log "start ${HOLD_UNIT}"
    "$SYSTEMCTL" start "$HOLD_UNIT" || return 1
    if dpms_is_off; then
        log "screen off: panel DPMS off, held by ${HOLD_UNIT}"
        exit 0
    fi
    log "screen off: DPMS still on; retrying with a restart of ${HOLD_UNIT} in ${RETRY_DELAY}s"
    sleep "$RETRY_DELAY"
    log "restart ${HOLD_UNIT}"
    "$SYSTEMCTL" restart "$HOLD_UNIT" || return 1
    if dpms_is_off; then
        log "screen off: panel DPMS off after retry, held by ${HOLD_UNIT}"
        exit 0
    fi
    log "screen off: panel still reports DPMS on after the retry; it may stay lit"
    exit 1
}

current_rotation() {
    [ -r "$ROTATION_FILE" ] || return 0
    sed -n 's/^CALVIN_COG_ROTATION=//p' "$ROTATION_FILE" | tail -n 1
}

write_rotation() {  # $1 = 0..3
    local value="$1" tmp
    mkdir -p "$(dirname "$ROTATION_FILE")"
    tmp="$(mktemp "${ROTATION_FILE}.XXXXXX")"
    {
        echo "# Calvin cog rotation (0=normal, 1=left/90 CCW, 2=inverted, 3=right/270)."
        echo "# Written by calvin-cog-panel.sh from the Kiosks display setting."
        echo "CALVIN_COG_ROTATION=${value}"
    } > "$tmp"
    chmod 0644 "$tmp"
    mv -f "$tmp" "$ROTATION_FILE"
}

case "${1:-}" in
    off)
        # A kiosk that boots inside its scheduled off window can reach this
        # before systemd has started the unit: stop is idempotent (an inactive
        # unit simply stays stopped), so the first off never fails the boot.
        log "stop ${UNIT}"
        "$SYSTEMCTL" stop "$UNIT" || log "stop ${UNIT} failed; blanking anyway"
        # Do not blank until cog has let go of DRM master, or the kernel's
        # console-mode restore turns DPMS back on and paints tty1 (CLV-116).
        if ! wait_for_master_release; then
            log "continuing without a confirmed stop; the panel may stay on"
        fi
        clear_console
        # off_with_holder exits unless the holder itself fails. The blank below
        # still darkens a monitor that sends no standby hotplug, but a failed
        # holder exits 1 so the agent retries on its next poll.
        fallback_status=0
        if holder_installed; then
            if ! off_with_holder; then
                log "screen off: ${HOLD_UNIT} failed (journalctl -u ${HOLD_UNIT}); blanking, but the panel may relight"
                stop_holder
                fallback_status=1
            fi
        else
            log "${HOLD_UNIT} is not installed; blanking only"
        fi
        blank_cycle
        if dpms_is_off; then
            log "screen off: panel DPMS off"
            exit "$fallback_status"
        fi
        log "screen off: DPMS still on after blanking; retrying the 0/4 sequence in ${RETRY_DELAY}s"
        sleep "$RETRY_DELAY"
        blank_cycle
        if dpms_is_off; then
            log "screen off: panel DPMS off after retry"
            exit "$fallback_status"
        fi
        # Fail so the agent retries the panel command on its next poll instead
        # of leaving the panel lit until the next schedule change.
        log "screen off: panel still reports DPMS on after the retry; it may stay lit"
        exit 1
        ;;
    on)
        # Release DRM master first: the kernel restores the console mode cog
        # needs, and ignores unblank writes while a master exists.
        stop_holder
        # Unblanking is best-effort: on a boot inside the off window fb0 can be
        # missing or unavailable. cog must be started regardless (start on an
        # already-running unit is a no-op), or the page never comes back.
        clear_console
        blank 0 || log "unblank failed; starting ${UNIT} anyway"
        log "start ${UNIT}"
        "$SYSTEMCTL" start "$UNIT"
        ;;
    rotate)
        value="${2:-}"
        case "$value" in
            0|1|2|3) ;;
            *) die "rotation must be 0, 1, 2 or 3 (got: ${value:-<missing>})" ;;
        esac
        if [ "$(current_rotation)" = "$value" ]; then
            log "rotation already ${value}; leaving ${UNIT} running"
            exit 0
        fi
        write_rotation "$value"
        log "rotation set to ${value} in ${ROTATION_FILE}"
        if "$SYSTEMCTL" is-active --quiet "$UNIT"; then
            log "restart ${UNIT} to apply rotation"
            "$SYSTEMCTL" restart "$UNIT"
        else
            log "${UNIT} is not running; rotation applies on the next start"
        fi
        ;;
    *)
        usage
        ;;
esac
