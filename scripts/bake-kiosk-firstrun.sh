#!/usr/bin/env bash
# Calvin — bake a first-boot bundle onto a freshly-flashed Raspberry Pi card.
#
# Writes firstrun.sh + a cmdline.txt hook onto the card's boot partition so the
# Pi self-provisions into a Calvin kiosk on first boot: no SSH, no per-Pi typing.
# Flash a CLEAN Raspberry Pi OS Bookworm image (do NOT use Imager's OS
# customization — it writes its own firstrun.sh and would collide).
set -euo pipefail

_CALVIN_SOURCE_ONLY=0
for _arg in "$@"; do
    [ "$_arg" = "--source-only" ] && _CALVIN_SOURCE_ONLY=1
done

DEFAULT_GIT_REPO="https://github.com/osterbergsimon/calvin.git"
DEFAULT_GIT_BRANCH="main"

BACKEND_URL=""; WIFI_SSID=""; WIFI_PSK=""; WIFI_COUNTRY=""
HOSTNAME_ARG=""; SSH_PUBKEY_FILE=""; BOOT_DIR=""
GIT_REPO="${GIT_REPO:-$DEFAULT_GIT_REPO}"; GIT_BRANCH="${GIT_BRANCH:-$DEFAULT_GIT_BRANCH}"

usage() {
    cat <<EOF
Usage: bake-kiosk-firstrun.sh --backend-url <URL> --boot-dir <PATH> [options]

Required:
  --backend-url <URL>   Calvin backend, e.g. http://homeserver.local:8000
  --boot-dir <PATH>     Mount point of the flashed card's boot partition
                        (contains cmdline.txt), e.g. /media/\$USER/bootfs

Options:
  --hostname <NAME>     Kiosk hostname (e.g. kitchen)
  --wifi-ssid <SSID>    Wifi network name (requires --wifi-country)
  --wifi-psk <PSK>      Wifi passphrase
  --wifi-country <CC>   Wifi regulatory domain, e.g. SE (required with wifi)
  --ssh-pubkey <FILE>   Public key to install for the calvin user
  --git-repo <URL>      Override Calvin repo (default: $DEFAULT_GIT_REPO)
  --git-branch <NAME>   Override branch (default: $DEFAULT_GIT_BRANCH)
EOF
}

parse_args() {
    # Reset flag-driven globals so repeated calls (and tests) don't accumulate.
    BACKEND_URL=""; WIFI_SSID=""; WIFI_PSK=""; WIFI_COUNTRY=""
    HOSTNAME_ARG=""; SSH_PUBKEY_FILE=""; BOOT_DIR=""
    GIT_REPO="${DEFAULT_GIT_REPO}"; GIT_BRANCH="${DEFAULT_GIT_BRANCH}"
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --backend-url) BACKEND_URL="${2:-}"; shift 2 ;;
            --backend-url=*) BACKEND_URL="${1#*=}"; shift ;;
            --boot-dir) BOOT_DIR="${2:-}"; shift 2 ;;
            --boot-dir=*) BOOT_DIR="${1#*=}"; shift ;;
            --hostname) HOSTNAME_ARG="${2:-}"; shift 2 ;;
            --hostname=*) HOSTNAME_ARG="${1#*=}"; shift ;;
            --wifi-ssid) WIFI_SSID="${2:-}"; shift 2 ;;
            --wifi-ssid=*) WIFI_SSID="${1#*=}"; shift ;;
            --wifi-psk) WIFI_PSK="${2:-}"; shift 2 ;;
            --wifi-psk=*) WIFI_PSK="${1#*=}"; shift ;;
            --wifi-country) WIFI_COUNTRY="${2:-}"; shift 2 ;;
            --wifi-country=*) WIFI_COUNTRY="${1#*=}"; shift ;;
            --ssh-pubkey) SSH_PUBKEY_FILE="${2:-}"; shift 2 ;;
            --ssh-pubkey=*) SSH_PUBKEY_FILE="${1#*=}"; shift ;;
            --git-repo) GIT_REPO="${2:-}"; shift 2 ;;
            --git-repo=*) GIT_REPO="${1#*=}"; shift ;;
            --git-branch) GIT_BRANCH="${2:-}"; shift 2 ;;
            --git-branch=*) GIT_BRANCH="${1#*=}"; shift ;;
            --source-only) shift ;;
            -h|--help) usage; exit 0 ;;
            *) echo "Unknown argument: $1" >&2; usage >&2; exit 1 ;;
        esac
    done
}

validate_args() {
    if [ -z "${BACKEND_URL}" ]; then
        echo "Error: --backend-url is required" >&2; return 1; fi
    if ! echo "${BACKEND_URL}" | grep -qE '^https?://'; then
        echo "Error: --backend-url must start with http:// or https:// (got: ${BACKEND_URL})" >&2; return 1; fi
    if [ -z "${BOOT_DIR}" ]; then
        echo "Error: --boot-dir is required" >&2; return 1; fi
    if [ ! -f "${BOOT_DIR}/cmdline.txt" ]; then
        echo "Error: --boot-dir does not look like a boot partition (no cmdline.txt): ${BOOT_DIR}" >&2; return 1; fi
    if [ -n "${WIFI_SSID}" ] && [ -z "${WIFI_COUNTRY}" ]; then
        echo "Error: --wifi-country is required when --wifi-ssid is set" >&2; return 1; fi
    return 0
}

derive_raw_setup_url() {
    local repo="$1" branch="$2" owner name
    owner="$(echo "${repo}" | sed -E 's|.*github\.com[:/]([^/]+)/([^/]+)$|\1|')"
    name="$(echo "${repo}" | sed -E 's|.*github\.com[:/]([^/]+)/([^/]+)$|\2|' | sed 's|\.git$||')"
    printf 'https://raw.githubusercontent.com/%s/%s/%s/scripts/setup-kiosk.sh\n' "${owner}" "${name}" "${branch}"
}

# Sourced for testing: stop before running main.
[ "${_CALVIN_SOURCE_ONLY}" = "1" ] && return 0 2>/dev/null || true

main() {
    parse_args "$@"
    validate_args
    echo "TODO: generate firstrun.sh (Task 4) and write cmdline hook (Task 5)"
}

main "$@"
