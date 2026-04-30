#!/bin/bash
# Calvin Dashboard - Raspberry Pi setup.
#
# Installs the kiosk dependencies plus Docker, then runs Calvin through
# docker compose. Use --mode prod for the published runtime image or
# --mode dev for the hot-reload compose stack.

set -euo pipefail

_ENV_GIT_BRANCH="${GIT_BRANCH:-}"
_ENV_GIT_REPO="${GIT_REPO:-}"

if [ -z "${_ENV_GIT_BRANCH}" ] && [ -f /etc/default/calvin-update ]; then
    _CONFIG_BRANCH=$(grep "^GIT_BRANCH=" /etc/default/calvin-update 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" || echo "")
    _CONFIG_REPO=$(grep "^GIT_REPO=" /etc/default/calvin-update 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" || echo "")
    if [ -n "${_CONFIG_BRANCH}" ]; then
        _ENV_GIT_BRANCH="${_CONFIG_BRANCH}"
    fi
    if [ -n "${_CONFIG_REPO}" ]; then
        _ENV_GIT_REPO="${_CONFIG_REPO}"
    fi
fi

COMMON_SCRIPT=""
if [ -f "./setup-common.sh" ]; then
    COMMON_SCRIPT="./setup-common.sh"
fi

if [ -z "${COMMON_SCRIPT}" ] && [ -n "${BASH_VERSION:-}" ]; then
    _script_dir=$(bash -c 'if [ -n "${BASH_SOURCE[0]:-}" ] && [ "${BASH_SOURCE[0]}" != "-" ]; then cd "$(dirname "${BASH_SOURCE[0]}")" && pwd; fi' 2>/dev/null || echo "")
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
CALVIN_DATA_DIR="${CALVIN_DATA_DIR:-/var/lib/calvin}"
SETUP_MODE="prod"

usage() {
    cat <<EOF
Usage: setup.sh [--mode prod|dev]

Environment overrides:
  GIT_REPO, GIT_BRANCH, CALVIN_DIR, CALVIN_USER, CALVIN_DATA_DIR
EOF
}

parse_args() {
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --mode)
                SETUP_MODE="${2:-}"
                shift 2
                ;;
            --mode=*)
                SETUP_MODE="${1#*=}"
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

    if [ "${SETUP_MODE}" != "prod" ] && [ "${SETUP_MODE}" != "dev" ]; then
        echo "Invalid mode: ${SETUP_MODE}. Expected prod or dev." >&2
        exit 1
    fi
}

install_docker_runtime() {
    log "Installing Docker runtime..."
    install_system_packages docker.io docker-compose-plugin

    systemctl enable docker || log_warn "Failed to enable docker.service"
    systemctl start docker || log_warn "Failed to start docker.service"
    usermod -aG docker "${CALVIN_USER}" || log_warn "Failed to add ${CALVIN_USER} to docker group"

    if ! docker compose version >/dev/null 2>&1; then
        error_exit "Docker Compose plugin is not available after installation" 1
    fi
}

create_runtime_data_dirs() {
    log "Creating Calvin runtime data directories under ${CALVIN_DATA_DIR}..."
    mkdir -p \
        "${CALVIN_DATA_DIR}/db" \
        "${CALVIN_DATA_DIR}/images" \
        "${CALVIN_DATA_DIR}/plugins" \
        "${CALVIN_DATA_DIR}/logs"
    chown -R "${CALVIN_USER}:${CALVIN_USER}" "${CALVIN_DATA_DIR}"
    chmod -R 755 "${CALVIN_DATA_DIR}"
}

install_compose_config() {
    local mode="$1"
    local source_compose="${CALVIN_DIR}/docker/docker-compose.yml"

    if [ "${mode}" = "dev" ]; then
        source_compose="${CALVIN_DIR}/docker/docker-compose.dev.yml"
    fi

    # Production layout: both files live in /etc/calvin/. Compose
    # auto-loads /etc/calvin/.env when invoked with
    # `-f /etc/calvin/docker-compose.yml` — no env_file directive,
    # no path rewriting needed.
    log "Installing ${mode} compose configuration..."
    mkdir -p /etc/calvin
    install -m 0644 "${source_compose}" /etc/calvin/docker-compose.yml

    if [ ! -f /etc/calvin/.env ]; then
        install -m 0640 "${CALVIN_DIR}/deploy/calvin.env.example" /etc/calvin/.env
    fi

    upsert_env_value /etc/calvin/.env CALVIN_DATA_DIR "${CALVIN_DATA_DIR}"
    if [ "${mode}" = "dev" ]; then
        # Dev compose bind-mounts the source tree at /app. Point it at
        # the actual checkout so the compose file can run from
        # /etc/calvin/ instead of the repo's docker/ dir.
        upsert_env_value /etc/calvin/.env CALVIN_REPO_DIR "${CALVIN_DIR}"
    fi

    if ! docker compose -f /etc/calvin/docker-compose.yml config >/dev/null; then
        error_exit "Installed Docker Compose configuration is invalid" 1
    fi
}

disable_legacy_services() {
    log "Disabling legacy native runtime services if present..."
    for service in \
        calvin-backend.service \
        calvin-frontend.service \
        calvin-frontend-dev.service; do
        if systemctl list-unit-files | grep -q "^${service}"; then
            systemctl stop "${service}" 2>/dev/null || true
            systemctl disable "${service}" 2>/dev/null || true
        fi
        rm -f "/etc/systemd/system/${service}"
    done
    systemctl daemon-reload 2>/dev/null || true
}

systemd_available() {
    [ -d /run/systemd/system ] && systemctl list-unit-files >/dev/null 2>&1
}

install_runtime_services() {
    log "Installing systemd services..."
    install_systemd_service "${CALVIN_DIR}/rpi-image/systemd/calvin-app.service" "${CALVIN_DIR}"
    install_systemd_service "${CALVIN_DIR}/rpi-image/systemd/calvin-x.service" "${CALVIN_DIR}"
    install_systemd_service "${CALVIN_DIR}/rpi-image/systemd/calvin-kiosk.service" "${CALVIN_DIR}"

    if systemd_available; then
        enable_systemd_service "calvin-app.service"
        enable_systemd_service "calvin-x.service"
        enable_systemd_service "calvin-kiosk.service"
    else
        log_warn "systemd is not running; installed service files but skipped enable"
    fi
}

start_runtime_services() {
    log "Starting Calvin runtime services..."
    if systemd_available; then
        start_systemd_service "calvin-app.service"
        start_systemd_service "calvin-x.service"
        sleep 3
        start_systemd_service "calvin-kiosk.service"
    else
        log_warn "systemd is not running; starting Docker Compose stack directly"
        docker compose -f /etc/calvin/docker-compose.yml up -d
    fi
}

verify_compose_runtime() {
    log "Verifying Docker Compose runtime..."
    verify_directory "${CALVIN_DIR}"
    verify_directory "${CALVIN_DATA_DIR}"
    verify_file "/etc/calvin/docker-compose.yml"
    verify_file "/etc/calvin/.env"

    if ! docker compose -f /etc/calvin/docker-compose.yml ps >/dev/null; then
        log_warn "Docker Compose stack is not queryable yet"
    fi

    log "Setup verification complete"
}

main() {
    parse_args "$@"

    log "=========================================="
    log "Calvin Raspberry Pi Setup"
    log "=========================================="
    log "Mode: ${SETUP_MODE}"
    log "Repository: ${GIT_REPO}"
    log "Branch: ${GIT_BRANCH}"
    log "Target Directory: ${CALVIN_DIR}"
    log "Data Directory: ${CALVIN_DATA_DIR}"
    log "User: ${CALVIN_USER}"
    log ""

    check_root
    mkdir -p "$(dirname "${LOG_FILE}")"

    ensure_user_exists "${CALVIN_USER}"
    update_system_packages

    log "Installing kiosk and system dependencies..."
    install_system_packages \
        curl \
        git \
        xserver-xorg \
        xinit \
        openbox \
        chromium \
        unclutter \
        xdotool \
        x11-xserver-utils \
        cron

    install_docker_runtime
    ensure_git_repo "${GIT_REPO}" "${GIT_BRANCH}" "${CALVIN_DIR}" "${CALVIN_USER}"
    create_runtime_data_dirs
    install_compose_config "${SETUP_MODE}"

    install_script "${CALVIN_DIR}/scripts/update-calvin.sh" "/usr/local/bin/update-calvin.sh" "${CALVIN_USER}"

    if [ -f "${CALVIN_DIR}/scripts/reboot-calvin.sh" ]; then
        install_privileged_sudo_helper_script "${CALVIN_DIR}/scripts/reboot-calvin.sh" "/usr/local/bin/reboot-calvin.sh"
        log "Configuring sudoers for reboot script..."
        echo "${CALVIN_USER} ALL=(root) NOPASSWD: /usr/local/bin/reboot-calvin.sh" > /etc/sudoers.d/calvin-reboot
        chmod 0440 /etc/sudoers.d/calvin-reboot
    fi

    if [ -f "${CALVIN_DIR}/scripts/restart-calvin-services.sh" ]; then
        install_privileged_sudo_helper_script "${CALVIN_DIR}/scripts/restart-calvin-services.sh" "/usr/local/bin/restart-calvin-services.sh"
        log "Configuring sudoers for restart script..."
        echo "${CALVIN_USER} ALL=(root) NOPASSWD: /usr/local/bin/restart-calvin-services.sh" > /etc/sudoers.d/calvin-restart
        chmod 0440 /etc/sudoers.d/calvin-restart
    fi

    configure_polkit_reboot "${CALVIN_USER}"
    create_update_config "${GIT_REPO}" "${GIT_BRANCH}" "${CALVIN_DIR}" "${SETUP_MODE}"
    configure_display "${CALVIN_USER}"
    configure_openbox_autostart "${CALVIN_USER}" "http://localhost:8000" "false"

    disable_legacy_services
    install_runtime_services
    start_runtime_services
    verify_compose_runtime

    log ""
    log "=========================================="
    log "Calvin Raspberry Pi Setup Complete!"
    log "=========================================="
    log "Mode: ${SETUP_MODE}"
    log "Compose file: /etc/calvin/docker-compose.yml"
    log "Environment file: /etc/calvin/.env"
    log "Data directory: ${CALVIN_DATA_DIR}"
    log ""
    log "IMPORTANT: Reboot to start X and the dashboard:"
    log "  sudo reboot"
    log ""
    log "After reboot:"
    log "  - Docker Compose starts Calvin via calvin-app.service"
    log "  - Kiosk mode starts via calvin-kiosk.service"
    log "  - Dashboard is available at http://localhost:8000"
    log ""
    log "To update Calvin in the future:"
    log "  update-calvin.sh"
    log ""
}

main "$@"
