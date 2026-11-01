#!/bin/bash
# Calvin Dashboard - Raspberry Pi kiosk-only setup.
#
# Installs only the kiosk side: cog (WPE WebKit on DRM/KMS) by default, with
# X11 + openbox + Chromium or Wayland + labwc available as alternative display
# stacks, and a systemd unit that points the browser at a remote Calvin backend
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

# Allow tests to source this file for its functions without executing setup.
_CALVIN_SOURCE_ONLY=0
BACKEND_URL=""
SIGNING_KEY=""
# --display-stack <x11|wayland|cog>; empty means "environment, then env file, then
# auto" (auto: cog on every board).
DISPLAY_STACK_ARG=""
DISPLAY_STACK=""
for _arg in "$@"; do
    if [ "$_arg" = "--source-only" ]; then
        _CALVIN_SOURCE_ONLY=1
    fi
done

# Compute a collision-proof default kiosk id: <hostname>-<6 hex from machine-id>.
# A stock Pi image defaults hostname to "raspberrypi", so hostname alone collides
# across multiple Pis; the machine-id suffix disambiguates. Falls back to the
# primary NIC MAC, then the Pi CPU serial, if machine-id is unavailable.
# Sanitize a hostname to the kiosk id/hostname allowlist ([A-Za-z0-9.-]) so a
# weird hostname can't inject odd bytes into CALVIN_KIOSK_ID / CALVIN_KIOSK_HOSTNAME
# (the backend registry rejects anything outside [A-Za-z0-9._-]).
sanitize_hostname() {
    printf '%s' "$1" | tr -cd 'A-Za-z0-9.-'
}

# The Pi's own hostname, sanitized. In Mode B the backend host differs from the
# kiosk host, so the kiosk must report its own hostname (default $(hostname),
# operator-editable in /etc/default/calvin-kiosk).
compute_default_kiosk_hostname() {
    local host
    host="${HOSTNAME_OVERRIDE:-$(hostname 2>/dev/null || echo kiosk)}"
    host="$(sanitize_hostname "$host")"
    [ -n "$host" ] || host="kiosk"
    printf '%s\n' "$host"
}

compute_default_kiosk_id() {
    local host suffix src
    host="$(compute_default_kiosk_hostname)"
    src="${MACHINE_ID_OVERRIDE:-}"
    if [ -z "$src" ] && [ -r /etc/machine-id ]; then src="$(cat /etc/machine-id)"; fi
    if [ -z "$src" ]; then
        # Iterate interfaces in stable sorted order; skip loopback and obvious
        # virtual interfaces (docker*, virbr*, veth*, br-*) to get a real NIC.
        local iface mac
        for iface in $(find /sys/class/net -maxdepth 1 -mindepth 1 -printf '%f\n' 2>/dev/null | sort); do
            case "$iface" in lo|docker*|virbr*|veth*|br-*) continue ;; esac
            mac="$(cat "/sys/class/net/$iface/address" 2>/dev/null || true)"
            if [ -n "$mac" ] && [ "$mac" != "00:00:00:00:00:00" ]; then
                src="$(printf '%s' "$mac" | tr -d ':')"
                break
            fi
        done
    fi
    if [ -z "$src" ]; then
        src="$(grep -m1 -i Serial /proc/cpuinfo 2>/dev/null | awk '{print $3}')"
    fi
    suffix="$(printf '%s' "$src" | tr -cd 'a-f0-9' | cut -c1-6)"
    [ -n "$suffix" ] || suffix="000000"
    printf '%s-%s\n' "$host" "$suffix"
}

# Upserts only the keys setup owns: the rotation/output/resolution settings
# operators keep in this file (DEPLOYMENT_TOPOLOGIES) survive a re-run.
install_kiosk_config() {
    local stack="${1:-x11}"
    local env_file="${CALVIN_KIOSK_ENV_FILE:-/etc/default/calvin-kiosk}"
    log "Updating ${env_file}..."
    # An operator-set CALVIN_KIOSK_ID / CALVIN_KIOSK_HOSTNAME wins over defaults.
    local existing_id="" existing_host=""
    if [ -f "$env_file" ]; then
        existing_id="$(grep '^CALVIN_KIOSK_ID=' "$env_file" | cut -d= -f2- || true)"
        existing_host="$(grep '^CALVIN_KIOSK_HOSTNAME=' "$env_file" | cut -d= -f2- || true)"
    else
        install -m 0644 /dev/null "$env_file"
    fi
    upsert_env_value "$env_file" CALVIN_BACKEND_URL "${BACKEND_URL}"
    upsert_env_value "$env_file" CALVIN_KIOSK_ID "${existing_id:-$(compute_default_kiosk_id)}"
    upsert_env_value "$env_file" CALVIN_KIOSK_HOSTNAME \
        "${existing_host:-$(compute_default_kiosk_hostname)}"
    # The display stack is setup-owned: a re-run with --display-stack switches it.
    upsert_env_value "$env_file" CALVIN_DISPLAY_STACK "${stack}"
    # Chromium's GPU path is operator-visible but defaults to auto (see
    # chromium_display_flags in setup-common.sh). Only seed it: an existing value,
    # including one set by hand, wins on every re-run.
    if [ -z "$(read_env_value "$env_file" CALVIN_CHROMIUM_GPU)" ]; then
        upsert_env_value "$env_file" CALVIN_CHROMIUM_GPU "auto"
    fi
}

# Which stack to install: requested_display_stack (setup-common.sh), shared with
# the all-in-one setup.sh.

usage() {
    cat <<EOF
Usage: setup-kiosk.sh --backend-url <URL> [--display-stack x11|wayland|cog]

Sets up a Raspberry Pi as a dumb kiosk pointed at a remote Calvin
backend. Installs X, openbox, and Chromium, then enables a systemd
unit that opens the dashboard URL on boot.

Required:
  --backend-url <URL>   Where the Calvin backend lives, e.g.
                        http://homeserver.local:8000

Options:
  --signing-key-file <FILE>  File holding the server's kiosk-signing.key (hex)
  --signing-key <HEX>        Same, inline (visible in ps and shell history)
  --display-stack <STACK>    auto (default; cog on every board), x11 (Chromium),
                             wayland (labwc) or cog (WPE WebKit on DRM/KMS).
                             All stacks stay installed: re-run with another
                             value to switch an existing kiosk in place.
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
            --display-stack) DISPLAY_STACK_ARG="${2:-}"; shift 2 ;;
            --display-stack=*) DISPLAY_STACK_ARG="${1#*=}"; shift ;;
            --signing-key) SIGNING_KEY="${2:-}"; shift 2 ;;
            --signing-key=*) SIGNING_KEY="${1#*=}"; shift ;;
            --signing-key-file) SIGNING_KEY="$(tr -d '[:space:]' < "${2:-}")"; shift 2 ;;
            --signing-key-file=*) SIGNING_KEY="$(tr -d '[:space:]' < "${1#*=}")"; shift ;;
            --source-only) shift ;;
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

# When sourced for testing, stop here — it only halts execution when the file is
# *sourced* (not when run directly), which is the intended test usage.
[ "${_CALVIN_SOURCE_ONLY}" = "1" ] && return 0 2>/dev/null || true

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
    # shellcheck source=setup-common.sh
    . "${COMMON_SCRIPT}"
else
    echo "Downloading setup-common.sh from GitHub..." >&2
    TEMP_DIR="$(mktemp -d)"
    trap 'rm -rf "${TEMP_DIR}"' EXIT 2>/dev/null || true

    GIT_REPO="${_ENV_GIT_REPO:-${GIT_REPO:-https://github.com/osterbergsimon/calvin.git}}"
    GIT_BRANCH="${_ENV_GIT_BRANCH:-${GIT_BRANCH:-develop}}"
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

    # shellcheck source=setup-common.sh
    . "${TEMP_DIR}/setup-common.sh"
fi

GIT_REPO="${_ENV_GIT_REPO:-${GIT_REPO:-$DEFAULT_GIT_REPO}}"
GIT_BRANCH="${_ENV_GIT_BRANCH:-${GIT_BRANCH:-$DEFAULT_GIT_BRANCH}}"
CALVIN_USER="${CALVIN_USER:-$DEFAULT_CALVIN_USER}"
LOG_FILE="${LOG_FILE:-$DEFAULT_LOG_FILE}"

systemd_available() {
    [ -d /run/systemd/system ] && systemctl list-unit-files >/dev/null 2>&1
}

install_kiosk_services() {
    log "Reloading systemd (units enabled by --bootstrap)..."
    if systemd_available; then
        systemctl daemon-reload
    else
        log_warn "systemd is not running; skipped daemon-reload"
    fi
}

start_kiosk_services() {
    log "Starting kiosk services..."
    if systemd_available; then
        if [ "${DISPLAY_STACK}" = "cog" ]; then
            # cog IS the browser on this stack: Chromium is not started at all.
            start_systemd_service "calvin-cog.service"
        else
            if [ "${DISPLAY_STACK}" = "wayland" ]; then
                start_systemd_service "calvin-wayland.service"
            else
                start_systemd_service "calvin-x.service"
            fi
            sleep 3
            start_systemd_service "calvin-kiosk-remote.service"
        fi
        start_systemd_service "calvin-display-agent.service"
    else
        log_warn "systemd is not running; skipped service start"
    fi
}

main() {
    parse_args "$@"
    require_fixed_calvin_user

    # Resolve before touching packages: everything below depends on the stack.
    DISPLAY_STACK="$(requested_display_stack)" || exit 1

    log "=========================================="
    log "Calvin Raspberry Pi Kiosk Setup"
    log "=========================================="
    log "Backend URL: ${BACKEND_URL}"
    log "User:        ${CALVIN_USER}"
    log "Display:     ${DISPLAY_STACK}"
    log ""

    check_root
    mkdir -p "$(dirname "${LOG_FILE}")"

    # (A baked --ssh-pubkey goes to the admin user firstrun.sh creates on boot 1,
    # not to calvin: calvin runs Chromium and has no sudo.)
    ensure_user_exists "${CALVIN_USER}"
    update_system_packages

    log "Installing kiosk dependencies..."
    # sudo: the display agent triggers remote updates via the sudoers fragment
    # below (present on Raspberry Pi OS, absent on minimal Debian images).
    install_system_packages "${CALVIN_KIOSK_PACKAGES[@]}"
    # Wayland packages are additive: the X11 set above stays installed so
    # switching back is a service switch, not a reimage.
    mapfile -t _wayland_pkgs < <(display_stack_packages "${DISPLAY_STACK}")
    if [ "${#_wayland_pkgs[@]}" -gt 0 ]; then
        log "Installing ${DISPLAY_STACK} display packages: ${_wayland_pkgs[*]}"
        install_system_packages "${_wayland_pkgs[@]}"
    fi
    configure_unattended_upgrades

    install_kiosk_config "${DISPLAY_STACK}"
    install_signing_key "${SIGNING_KEY}"
    log "Bootstrapping kiosk bundle via update-kiosk.sh --bootstrap from ${BACKEND_URL}..."
    bootstrap_kiosk "${BACKEND_URL}"
    install_sudoers_fragment calvin-kiosk-update \
        "${CALVIN_USER} ALL=(root) NOPASSWD: /bin/systemctl start --no-block calvin-kiosk-update.service"
    # Root helper for cog panel power/rotation (setup-common.sh).
    install_cog_panel_sudoers "${CALVIN_USER}"

    configure_display "${CALVIN_USER}"
    # Chromium is managed by calvin-kiosk-remote.service; openbox
    # autostart only needs to launch openbox itself plus the usual
    # screensaver/cursor tweaks.
    configure_openbox_autostart "${CALVIN_USER}" "${BACKEND_URL}" "false"
    # Session env + labwc config + exactly one enabled compositor unit.
    apply_display_stack "${DISPLAY_STACK}" "${CALVIN_USER}"

    install_kiosk_services
    start_kiosk_services

    log ""
    log "=========================================="
    log "Calvin Kiosk Setup Complete!"
    log "=========================================="
    log "Backend URL:    ${BACKEND_URL}"
    log "Display stack:  ${DISPLAY_STACK}"
    log "Config file:    /etc/default/calvin-kiosk"
    log "Systemd units:  calvin-x.service, calvin-wayland.service or calvin-cog.service,"
    log "                calvin-kiosk-remote.service, calvin-display-agent.service"
    log ""
    log "To change the backend URL later:"
    log "  sudo nano /etc/default/calvin-kiosk"
    log "  sudo systemctl restart calvin-kiosk-remote.service"
    log ""
    log "To switch display stack later (re-runs the installer in place):"
    log "  sudo bash install-kiosk.sh --backend-url ${BACKEND_URL} --display-stack wayland"
    log "  sudo bash install-kiosk.sh --backend-url ${BACKEND_URL} --display-stack cog"
    log "  sudo bash install-kiosk.sh --backend-url ${BACKEND_URL} --display-stack x11"
    log ""
    log "Reboot to start the kiosk:"
    log "  sudo reboot"
    log ""
}

main "$@"
