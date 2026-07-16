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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

BACKEND_URL=""; WIFI_SSID=""; WIFI_PSK=""; WIFI_COUNTRY=""
HOSTNAME_ARG=""; SSH_PUBKEY_FILE=""; BOOT_DIR=""; SIGNING_KEY=""
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
  --signing-key <HEX>   Out-of-band 0600 manifest signing secret (hex)
  --signing-key-file <FILE>
                        Read signing secret from a 0600 file
EOF
}

parse_args() {
    # Reset flag-driven globals so repeated calls (and tests) don't accumulate.
    BACKEND_URL=""; WIFI_SSID=""; WIFI_PSK=""; WIFI_COUNTRY=""
    HOSTNAME_ARG=""; SSH_PUBKEY_FILE=""; BOOT_DIR=""; SIGNING_KEY=""
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
            --signing-key) SIGNING_KEY="${2:-}"; shift 2 ;;
            --signing-key=*) SIGNING_KEY="${1#*=}"; shift ;;
            --signing-key-file) SIGNING_KEY="$(cat "${2:-}")"; shift 2 ;;
            --signing-key-file=*) SIGNING_KEY="$(cat "${1#*=}")"; shift ;;
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

emit_firstrun() {
    local setup_url wrapper_src unit_src
    setup_url="$(derive_raw_setup_url "${GIT_REPO}" "${GIT_BRANCH}")"
    wrapper_src="$(cat "${REPO_ROOT}/deploy/kiosk-agent/calvin-kiosk-firstboot.sh")"
    unit_src="$(cat "${REPO_ROOT}/deploy/systemd/calvin-kiosk-firstboot.service")"

    local pubkey=""
    [ -n "${SSH_PUBKEY_FILE}" ] && pubkey="$(cat "${SSH_PUBKEY_FILE}")"

    cat <<'FIRSTRUN_EOF'
#!/bin/bash
# Calvin kiosk first-boot (boot 1, offline). Generated by bake-kiosk-firstrun.sh.
# Stages host/wifi/ssh + seeds config, enables the boot-2 provisioning service,
# then removes its own cmdline hook and reboots.
set -euo pipefail
BOOT_CMDLINE=/boot/firmware/cmdline.txt
ENV_FILE=/etc/default/calvin-kiosk
FIRSTRUN_EOF

    # --- baked values: printf '%q' produces bash-safe assignments that survive
    #     single-quotes, double-quotes, $, \, spaces, and other shell metacharacters
    #     in WPA passphrases, SSIDs, etc.  The generated firstrun starts with
    #     #!/bin/bash so %q output is always safe to source there.
    emit_var() { printf '%s=%q\n' "$1" "$2"; }
    emit_var CALVIN_HOSTNAME "${HOSTNAME_ARG}"
    emit_var WIFI_SSID       "${WIFI_SSID}"
    emit_var WIFI_PSK        "${WIFI_PSK}"
    emit_var WIFI_COUNTRY    "${WIFI_COUNTRY}"
    emit_var BACKEND_URL     "${BACKEND_URL}"
    emit_var SETUP_KIOSK_URL "${setup_url}"
    emit_var SSH_PUBKEY      "${pubkey}"
    emit_var SIGNING_KEY     "${SIGNING_KEY}"

    cat <<'FIRSTRUN_EOF'

# 1. Hostname.
if [ -n "${CALVIN_HOSTNAME}" ]; then
    echo "${CALVIN_HOSTNAME}" > /etc/hostname
    sed -i "s/^127.0.1.1.*/127.0.1.1\t${CALVIN_HOSTNAME}/" /etc/hosts || true
fi

# 2. Wifi (NetworkManager keyfile), only if an SSID was baked.
if [ -n "${WIFI_SSID}" ]; then
    command -v raspi-config >/dev/null 2>&1 && raspi-config nonint do_wifi_country "${WIFI_COUNTRY}" || true
    conn=/etc/NetworkManager/system-connections/CalvinKiosk.nmconnection
    mkdir -p /etc/NetworkManager/system-connections
    cat > "${conn}" <<NMEOF
[connection]
id=CalvinKiosk
type=wifi
autoconnect=true
[wifi]
mode=infrastructure
ssid=${WIFI_SSID}
[wifi-security]
key-mgmt=wpa-psk
psk=${WIFI_PSK}
[ipv4]
method=auto
[ipv6]
method=auto
NMEOF
    chmod 600 "${conn}"
fi

# 3. SSH on for recovery.
systemctl enable ssh >/dev/null 2>&1 || true

# 4. Seed /etc/default/calvin-kiosk for the boot-2 provisioning service.
touch "${ENV_FILE}"; chmod 644 "${ENV_FILE}"
{
    echo "CALVIN_BACKEND_URL=${BACKEND_URL}"
    echo "CALVIN_SETUP_KIOSK_URL=${SETUP_KIOSK_URL}"
    [ -n "${SSH_PUBKEY}" ] && echo "CALVIN_KIOSK_SSH_PUBKEY=${SSH_PUBKEY}"
} > "${ENV_FILE}"

# 4b. Seed the root-only manifest signing key (calvin-5vw), if one was baked.
if [ -n "${SIGNING_KEY}" ]; then
    SIGNING_ENV_FILE=/etc/default/calvin-kiosk-signing
    touch "${SIGNING_ENV_FILE}"; chmod 600 "${SIGNING_ENV_FILE}"
    echo "CALVIN_KIOSK_SIGNING_KEY=${SIGNING_KEY}" > "${SIGNING_ENV_FILE}"
fi

# 5. Install the boot-2 wrapper + oneshot service.
cat > /usr/local/bin/calvin-kiosk-firstboot.sh <<'WRAPPER_EOF'
FIRSTRUN_EOF

    printf '%s\n' "${wrapper_src}"
    cat <<'FIRSTRUN_EOF'
WRAPPER_EOF
chmod 755 /usr/local/bin/calvin-kiosk-firstboot.sh

cat > /etc/systemd/system/calvin-kiosk-firstboot.service <<'UNIT_EOF'
FIRSTRUN_EOF

    printf '%s\n' "${unit_src}"
    cat <<'FIRSTRUN_EOF'
UNIT_EOF
systemctl enable calvin-kiosk-firstboot.service >/dev/null 2>&1 || true

# 6. Remove our own first-boot hook so this never runs again, then reboot.
sed -i 's| systemd.run=[^ ]*||g; s| systemd.run_success_action=[^ ]*||g; s| systemd.unit=[^ ]*||g' "${BOOT_CMDLINE}" || true
reboot
FIRSTRUN_EOF
}

CMDLINE_HOOK='systemd.run=/boot/firmware/firstrun.sh systemd.run_success_action=reboot systemd.unit=kernel-command-line.target'

append_cmdline_hook() {
    local cmdline="$1"
    if grep -q 'systemd.run=/boot/firmware/firstrun.sh' "${cmdline}"; then
        return 0
    fi
    # cmdline.txt must remain a single line: strip the trailing newline,
    # append the hook, restore one newline.
    local content
    content="$(tr -d '\n' < "${cmdline}")"
    printf '%s %s\n' "${content}" "${CMDLINE_HOOK}" > "${cmdline}"
}

main() {
    parse_args "$@"
    validate_args
    emit_firstrun > "${BOOT_DIR}/firstrun.sh"
    chmod 755 "${BOOT_DIR}/firstrun.sh"
    append_cmdline_hook "${BOOT_DIR}/cmdline.txt"
    echo "Baked kiosk firstrun into ${BOOT_DIR}."
    echo "Backend: ${BACKEND_URL}"
    [ -n "${HOSTNAME_ARG}" ] && echo "Hostname: ${HOSTNAME_ARG}"
    echo "Eject the card, boot the Pi, and wait — it self-provisions (2 reboots)."
}

# Sourced for testing: stop before running main.
[ "${_CALVIN_SOURCE_ONLY}" = "1" ] && return 0 2>/dev/null || true

main "$@"
