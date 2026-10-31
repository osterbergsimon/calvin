#!/usr/bin/env bash
# Calvin cog panel helper — the root half of the display agent on the cog stack.
#
# cog owns DRM master, so nobody else can set DPMS while it runs: screen-off is
# "stop cog, then blank the framebuffer"; screen-on is "unblank, then start cog".
# Rotation is a cog startup property (`--platform-params=renderer=gles,rotation=N`),
# so a change is written to /etc/default/calvin-kiosk-cog and applied by
# restarting the unit.
#
# Installed root-owned at /usr/local/bin/calvin-cog-panel.sh; the calvin user may
# run only this helper through sudo (deploy/kiosk-agent/calvin-kiosk-cog.sudoers
# content, installed by setup-kiosk.sh). Args are validated here so the sudoers
# wildcard for `rotate` cannot smuggle anything else.
set -euo pipefail

UNIT="${CALVIN_COG_UNIT:-calvin-cog.service}"
ROTATION_FILE="${CALVIN_COG_ROTATION_FILE:-/etc/default/calvin-kiosk-cog}"
FB_BLANK="${CALVIN_FB_BLANK:-/sys/class/graphics/fb0/blank}"
SYSTEMCTL="${CALVIN_COG_SYSTEMCTL:-systemctl}"

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
        blank 4
        ;;
    on)
        # Unblanking is best-effort: on a boot inside the off window fb0 can be
        # missing or unavailable. cog must be started regardless (start on an
        # already-running unit is a no-op), or the page never comes back.
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
