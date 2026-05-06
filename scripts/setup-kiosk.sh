#!/bin/bash
# Calvin Dashboard - Raspberry Pi kiosk-only setup.
#
# Installs only the kiosk side: X server, openbox, Chromium, and a
# systemd unit that points the browser at a remote Calvin backend
# (typically running on a home server). No Docker, no Calvin source
# tree, no SQLite.
#
# Use this when you want one host to run the backend (e.g. a NAS or
# always-on Linux box) and one or more Raspberry Pis to act as dumb
# kiosks displaying the dashboard.
#
# Tested on Raspberry Pi OS (Bookworm). Other Debian-based distros may
# work but are not supported.

set -euo pipefail

_ENV_GIT_BRANCH="${GIT_BRANCH:-}"
_ENV_GIT_REPO="${GIT_REPO:-}"

COMMON_SCRIPT=""
if [ -f "./setup-common.sh" ]; then
    COMMON_SCRIPT="./setup-common.sh"
fi

if [ -z "${COMMON_SCRIPT}" ] && [ -n "${BASH_VERSION:-}" ]; then
    _script_source="${BASH_SOURCE[0]:-}"
    _script_dir=""
    if [ -n "${_script_source}" ] && [ "${_script_source}" != "-" ]; then
        _script_dir=$(cd "$(dirname "${_script_source}")" && pwd 2>/dev/null || echo "")
    fi
    if [ -n "${_script_dir}" ] && [ -f "${_script_dir}/setup-common.sh" ]; then
        COMMON_SCRIPT="${_script_dir}/setup-common.sh"
    fi
fi

if [ -n "${COMMON_SCRIPT}" ] && [ -f "${COMMON_SCRIPT}" ]; then
    . "${COMMON_SCRIPT}"
else
    echo "Downloading setup-common.sh from GitHub..." >&2
    TEMP_DIR="$(mktemp -d)"
    trap "rm -rf '${TEMP_DIR}'" EXIT 2>/dev/null || true

    GIT_REPO="${_ENV_GIT_REPO:-${GIT_REPO:-https://github.com/osterbergsimon/calvin.git}}"
    GIT_BRANCH="${_ENV_GIT_BRANCH:-${GIT_BRANCH:-main}}"
    repo_owner=$(echo "${GIT_REPO}" | sed -E 's|.*github\.com[:/]([^/]+)/([^/]+)(\.git)?$|\1|')
    repo_name=$(echo "${GIT_REPO}" | sed -E 's|.*github\.com[:/]([^/]+)/([^/]+)(\.git)?$|\2|' | sed 's|\.git$||')

    if [ -z "${repo_owner}" ] || [ -z "${repo_name}" ]; then
        echo "Error: Could not extract repo owner/name from ${GIT_REPO}" >&2
        exit 1
    fi

    common_url="https://raw.githubusercontent.com/${repo_owner}/${repo_name}/${GIT_BRANCH}/scripts/setup-common.sh"
    if command -v curl &> /dev/null; then
        curl -fsSL -o "${TEMP_DIR}/setup-common.sh" "${common_url}" || {
            echo "Error: Failed to download setup-common.sh from ${common_url}" >&2
            exit 1
        }
    elif command -v wget &> /dev/null; then
        wget -q -O "${TEMP_DIR}/setup-common.sh" "${common_url}" || {
            echo "Error: Failed to download setup-common.sh from ${common_url}" >&2
            exit 1
        }
    else
        echo "Error: Neither curl nor wget is available. Please install one of them." >&2
        exit 1
    fi

    . "${TEMP_DIR}/setup-common.sh"
fi

GIT_REPO="${_ENV_GIT_REPO:-${GIT_REPO:-$DEFAULT_GIT_REPO}}"
GIT_BRANCH="${_ENV_GIT_BRANCH:-${GIT_BRANCH:-$DEFAULT_GIT_BRANCH}}"
CALVIN_DIR="${CALVIN_DIR:-$DEFAULT_CALVIN_DIR}"
CALVIN_USER="${CALVIN_USER:-$DEFAULT_CALVIN_USER}"
LOG_FILE="${LOG_FILE:-$DEFAULT_LOG_FILE}"
BACKEND_URL=""

usage() {
    cat <<EOF
Usage: setup-kiosk.sh --backend-url <URL>

Sets up a Raspberry Pi as a dumb kiosk pointed at a remote Calvin
backend. Installs X, openbox, and Chromium, then enables a systemd
unit that opens the dashboard URL on boot.

Required:
  --backend-url <URL>   Where the Calvin backend lives, e.g.
                        http://homeserver.local:8000

Environment overrides:
  GIT_REPO, GIT_BRANCH, CALVIN_DIR, CALVIN_USER
EOF
}

parse_args() {
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --backend-url)
                BACKEND_URL="${2:-}"
                shift 2
                ;;
            --backend-url=*)
                BACKEND_URL="${1#*=}"
                shift
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                echo "Unknown argument: $1" >&2
                usage >&2
                exit 1
                ;;
        esac
    done

    if [ -z "${BACKEND_URL}" ]; then
        echo "Error: --backend-url is required" >&2
        usage >&2
        exit 1
    fi

    if ! echo "${BACKEND_URL}" | grep -qE '^https?://'; then
        echo "Error: --backend-url must start with http:// or https:// (got: ${BACKEND_URL})" >&2
        exit 1
    fi
}

install_kiosk_config() {
    log "Writing /etc/default/calvin-kiosk..."
    install -m 0644 /dev/null /etc/default/calvin-kiosk
    upsert_env_value /etc/default/calvin-kiosk CALVIN_BACKEND_URL "${BACKEND_URL}"
}

ensure_repo_for_unit_files() {
    # We only need the systemd unit files from the repo. The cheapest
    # honest way is a shallow clone via the existing helper — same path
    # as the all-in-one setup so future maintenance touches one place.
    ensure_git_repo "${GIT_REPO}" "${GIT_BRANCH}" "${CALVIN_DIR}" "${CALVIN_USER}"
}

systemd_available() {
    [ -d /run/systemd/system ] && systemctl list-unit-files >/dev/null 2>&1
}

install_kiosk_services() {
    log "Installing systemd services..."
    install_systemd_service "${CALVIN_DIR}/deploy/systemd/calvin-x.service" "${CALVIN_DIR}"
    install_systemd_service "${CALVIN_DIR}/deploy/systemd/calvin-kiosk-remote.service" "${CALVIN_DIR}"

    if systemd_available; then
        enable_systemd_service "calvin-x.service"
        enable_systemd_service "calvin-kiosk-remote.service"
    else
        log_warn "systemd is not running; installed service files but skipped enable"
    fi
}

start_kiosk_services() {
    log "Starting kiosk services..."
    if systemd_available; then
        start_systemd_service "calvin-x.service"
        sleep 3
        start_systemd_service "calvin-kiosk-remote.service"
    else
        log_warn "systemd is not running; skipped service start"
    fi
}

main() {
    parse_args "$@"

    log "=========================================="
    log "Calvin Raspberry Pi Kiosk Setup"
    log "=========================================="
    log "Backend URL: ${BACKEND_URL}"
    log "Repository:  ${GIT_REPO}"
    log "Branch:      ${GIT_BRANCH}"
    log "User:        ${CALVIN_USER}"
    log ""

    check_root
    mkdir -p "$(dirname "${LOG_FILE}")"

    ensure_user_exists "${CALVIN_USER}"
    update_system_packages

    log "Installing kiosk dependencies..."
    install_system_packages \
        curl \
        git \
        xserver-xorg \
        xinit \
        openbox \
        chromium \
        unclutter \
        xdotool \
        x11-xserver-utils

    ensure_repo_for_unit_files
    install_kiosk_config

    configure_display "${CALVIN_USER}"
    # Chromium is managed by calvin-kiosk-remote.service; openbox
    # autostart only needs to launch openbox itself plus the usual
    # screensaver/cursor tweaks.
    configure_openbox_autostart "${CALVIN_USER}" "${BACKEND_URL}" "false"

    install_kiosk_services
    start_kiosk_services

    log ""
    log "=========================================="
    log "Calvin Kiosk Setup Complete!"
    log "=========================================="
    log "Backend URL:    ${BACKEND_URL}"
    log "Config file:    /etc/default/calvin-kiosk"
    log "Systemd units:  calvin-x.service, calvin-kiosk-remote.service"
    log ""
    log "To change the backend URL later:"
    log "  sudo nano /etc/default/calvin-kiosk"
    log "  sudo systemctl restart calvin-kiosk-remote.service"
    log ""
    log "Reboot to start the kiosk:"
    log "  sudo reboot"
    log ""
}

main "$@"
