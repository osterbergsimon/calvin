#!/usr/bin/env bash
# Calvin — one-command kiosk installer for a fresh Raspberry Pi OS.
#
# The Calvin server serves this file at /api/kiosks/install.sh with its own URL
# baked in, so on the Pi:
#
#   curl -fsSL http://<server>:8000/api/kiosks/install.sh | sudo bash
#
# That copy arrives over plain HTTP, so don't pair it with the signing key (a
# tampered copy could read the key). For a keyed install, fetch this file over
# the same trusted channel as the key; see docs/setup/KIOSK_INSTALL.md.
#
# It downloads setup-kiosk.sh + setup-common.sh from the same server (never from
# GitHub, so the kiosk always matches the server's version), checks them against
# the bundle manifest (HMAC-verified when a signing key is given or already on the
# device), runs setup-kiosk.sh, and reboots into the kiosk.
#
# Run from a checkout (or baked onto a card by bake-kiosk-firstrun.sh) the URL is
# not baked in, so pass --backend-url.
set -euo pipefail

# Everything runs inside main(), called on the last line, so a truncated download
# runs nothing.

# Replaced by the server when it serves this file; stays a placeholder otherwise.
SERVER_URL='@CALVIN_SERVER_URL@'
case "$SERVER_URL" in @*) SERVER_URL="" ;; esac

SIGNING_ENV_FILE="${CALVIN_KIOSK_SIGNING_ENV_FILE:-/etc/default/calvin-kiosk-signing}"
REBOOT_DELAY="${CALVIN_INSTALL_REBOOT_DELAY:-5}"
SIGNING_KEY=""
REBOOT=1
DISPLAY_STACK=""  # empty = let setup-kiosk.sh decide (env / existing config / auto)
work=""  # global: the EXIT trap runs after main() returns

log() { printf '[calvin-install] %s\n' "$*"; }
die() { printf '[calvin-install] ERROR: %s\n' "$*" >&2; exit 1; }

usage() {
    cat <<EOF
Usage: install-kiosk.sh [options]

Turns this Raspberry Pi into a Calvin kiosk for a Calvin server.

Options:
  --backend-url <URL>        Calvin server (default: the server this script came from${SERVER_URL:+, $SERVER_URL})
  --signing-key-file <FILE>  File holding the server's kiosk-signing.key (hex)
  --signing-key <HEX>        Same, inline (ends up in shell history; prefer the file)
  --display-stack <STACK>    x11 (default) or wayland (labwc, experimental).
                             Re-run with the other value to switch an existing
                             kiosk in place; both stacks stay installed.
  --no-reboot                Do not reboot when done
  -h, --help                 Show this help
EOF
}

need_value() { [ "$2" -ge 2 ] || die "$1 needs a value"; }

read_key_file() {
    [ -r "$1" ] || die "cannot read signing key file: $1"
    tr -d '[:space:]' < "$1"
}

main() {
while [ "$#" -gt 0 ]; do
    case "$1" in
        --backend-url) need_value "$1" "$#"; SERVER_URL="$2"; shift 2 ;;
        --backend-url=*) SERVER_URL="${1#*=}"; shift ;;
        --signing-key) need_value "$1" "$#"; SIGNING_KEY="$2"; shift 2 ;;
        --signing-key=*) SIGNING_KEY="${1#*=}"; shift ;;
        --signing-key-file) need_value "$1" "$#"; SIGNING_KEY="$(read_key_file "$2")"; shift 2 ;;
        --signing-key-file=*) SIGNING_KEY="$(read_key_file "${1#*=}")"; shift ;;
        --display-stack) need_value "$1" "$#"; DISPLAY_STACK="$2"; shift 2 ;;
        --display-stack=*) DISPLAY_STACK="${1#*=}"; shift ;;
        --no-reboot) REBOOT=0; shift ;;
        -h|--help) usage; exit 0 ;;
        *) usage >&2; die "unknown argument: $1" ;;
    esac
done

SERVER_URL="${SERVER_URL%/}"
[ -n "$SERVER_URL" ] || die "no server URL; pass --backend-url http://<server>:8000"
case "$SERVER_URL" in http://*|https://*) ;; *) die "--backend-url must start with http:// or https://" ;; esac
case "$DISPLAY_STACK" in
    ""|x11|wayland) ;;
    *) die "--display-stack must be x11 or wayland (got: $DISPLAY_STACK)" ;;
esac
[ "$(id -u)" -eq 0 ] || die "run as root: curl -fsSL $SERVER_URL/api/kiosks/install.sh | sudo bash"
for cmd in curl python3 sha256sum; do
    command -v "$cmd" >/dev/null 2>&1 || die "$cmd is required but not installed"
done

local store_key=0
if [ -n "$SIGNING_KEY" ]; then
    printf '%s' "$SIGNING_KEY" | grep -qE '^[0-9a-fA-F]{64}$' \
        || die "signing key must be 64 hex characters (the content of kiosk-signing.key)"
    store_key=1
elif [ -f "$SIGNING_ENV_FILE" ]; then
    SIGNING_KEY="$(grep '^CALVIN_KIOSK_SIGNING_KEY=' "$SIGNING_ENV_FILE" | cut -d= -f2- || true)"
fi

local manifest installer_list name sha got
log "server: $SERVER_URL"
manifest="$(curl -fsSL "$SERVER_URL/api/kiosks/agent/manifest")" \
    || die "cannot reach $SERVER_URL/api/kiosks/agent/manifest (is the server running and reachable?)"

# Verify the signature (when keyed) and print "<name> <sha256>" per installer file.
installer_list="$(MANIFEST_JSON="$manifest" CALVIN_KIOSK_SIGNING_KEY="$SIGNING_KEY" python3 - <<'PY'
import hashlib, hmac, json, os, sys
def fail(msg):
    sys.stderr.write(msg + "\n")
    sys.exit(1)
try:
    m = json.loads(os.environ["MANIFEST_JSON"])
except Exception:
    fail("manifest is not valid JSON")
key = os.environ.get("CALVIN_KIOSK_SIGNING_KEY", "")
sig = m.pop("signature", None)
alg = m.pop("sig_alg", None)
if key:
    if sig is None or alg != "hmac-sha256":
        fail("manifest signature missing or unsupported; refusing (signing key is set)")
    canon = json.dumps(m, sort_keys=True, separators=(",", ":")).encode()
    tag = hmac.new(bytes.fromhex(key), canon, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(tag, str(sig)):
        fail("manifest signature invalid; wrong signing key or tampered response")
installer = m.get("installer")
if not installer:
    fail("server manifest lists no installer files; update the Calvin server first")
for f in installer:
    print(f["name"], f["sha256"])
PY
)" || die "manifest check failed (see above)"

if [ "$store_key" = 1 ]; then
    # Only a key the server's signature just proved is stored. Root-only file;
    # bootstrap + the updater read it from here, never from a command line.
    install -m 0600 /dev/null "$SIGNING_ENV_FILE"
    printf 'CALVIN_KIOSK_SIGNING_KEY=%s\n' "$SIGNING_KEY" > "$SIGNING_ENV_FILE"
    log "signing key verified and stored in $SIGNING_ENV_FILE"
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
while read -r name sha; do
    case "$name" in setup-kiosk.sh|setup-common.sh) ;; *) continue ;; esac
    curl -fsSL "$SERVER_URL/api/kiosks/installer/$name" -o "$work/$name" \
        || die "download failed: $name"
    got="$(sha256sum "$work/$name" | cut -d' ' -f1)"
    [ "$got" = "$sha" ] || die "checksum mismatch for $name; refusing to run it"
done <<< "$installer_list"
[ -f "$work/setup-kiosk.sh" ] && [ -f "$work/setup-common.sh" ] \
    || die "server manifest is missing setup-kiosk.sh or setup-common.sh"

log "running setup-kiosk.sh (installs the display stack, Chromium and the Calvin kiosk services)..."
# From $work, so its ./setup-common.sh lookup finds the verified copy. stdin from
# /dev/null: under `curl | bash` the rest of this script IS stdin, and a package
# prompt reading it would swallow it.
local setup_args=(--backend-url "$SERVER_URL")
[ -n "$DISPLAY_STACK" ] && setup_args+=(--display-stack "$DISPLAY_STACK")
(cd "$work" && bash ./setup-kiosk.sh "${setup_args[@]}") </dev/null

if [ "$REBOOT" = 1 ]; then
    log "done; rebooting into the kiosk in ${REBOOT_DELAY}s (Ctrl-C to cancel)"
    sleep "$REBOOT_DELAY"
    systemctl reboot
else
    log "done; reboot to start the kiosk: sudo reboot"
fi
}

main "$@"
