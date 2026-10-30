#!/bin/bash
# Calvin Dashboard - Raspberry Pi setup.
#
# Installs the kiosk dependencies plus Docker, then runs Calvin through
# docker compose. Use --mode prod for the published runtime image or
# --mode dev for the hot-reload compose stack.

set -euo pipefail

# Tests source this file for its functions without running setup.
_CALVIN_SOURCE_ONLY=0
for _arg in "$@"; do
    if [ "$_arg" = "--source-only" ]; then
        _CALVIN_SOURCE_ONLY=1
    fi
done

_ENV_GIT_BRANCH="${GIT_BRANCH:-}"
_ENV_GIT_REPO="${GIT_REPO:-}"

_UPDATE_CONF="${CALVIN_DEFAULT_DIR:-/etc/default}/calvin-update"
if [ -z "${_ENV_GIT_BRANCH}" ] && [ -f "${_UPDATE_CONF}" ]; then
    _CONFIG_BRANCH=$(grep "^GIT_BRANCH=" "${_UPDATE_CONF}" 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" || echo "")
    _CONFIG_REPO=$(grep "^GIT_REPO=" "${_UPDATE_CONF}" 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" || echo "")
    if [ -n "${_CONFIG_BRANCH}" ]; then
        _ENV_GIT_BRANCH="${_CONFIG_BRANCH}"
    fi
    if [ -n "${_CONFIG_REPO}" ]; then
        _ENV_GIT_REPO="${_CONFIG_REPO}"
    fi
fi

# main is release-only: it lacks the compose file and units this script
# installs, and no :latest image is published. Hosts set up before develop
# became the default still record it, so it is replaced before anything
# (setup-common.sh included) is fetched from it.
if [ "${_ENV_GIT_BRANCH}" = "main" ]; then
    echo "Note: GIT_BRANCH=main is release-only and cannot be deployed; using develop." >&2
    _ENV_GIT_BRANCH="develop"
fi

# setup-common.sh from this script's own directory, never from the current
# one (this runs as root, possibly from an untrusted working directory).
COMMON_SCRIPT=""
if [ -n "${BASH_VERSION:-}" ]; then
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
    # Never main: it is release-only and far behind develop.
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
# Install locations; overridable so tests can run against a temp dir.
CALVIN_ETC_DIR="${CALVIN_ETC_DIR:-/etc/calvin}"
# A re-run or refresh keeps what the host was installed with: the checkout
# recorded for updates and the data dir in .env (resetting it to the default
# would make the data look lost).
CALVIN_DIR="${CALVIN_DIR:-$(read_env_value "${CALVIN_DEFAULT_DIR:-/etc/default}/calvin-update" REPO_DIR)}"
CALVIN_DIR="${CALVIN_DIR:-$DEFAULT_CALVIN_DIR}"
CALVIN_DATA_DIR="${CALVIN_DATA_DIR:-$(read_env_value "${CALVIN_ETC_DIR}/.env" CALVIN_DATA_DIR)}"
CALVIN_DATA_DIR="${CALVIN_DATA_DIR:-/var/lib/calvin}"
# Where host files are installed from (see resolve_source_dir).
CALVIN_SOURCE_DIR="${CALVIN_SOURCE_DIR:-}"
CALVIN_BIN_DIR="${CALVIN_BIN_DIR:-/usr/local/bin}"
CALVIN_SYSTEMD_DIR="${CALVIN_SYSTEMD_DIR:-/etc/systemd/system}"
CALVIN_KIOSK_ENV_FILE="${CALVIN_KIOSK_ENV_FILE:-${CALVIN_DEFAULT_DIR:-/etc/default}/calvin-kiosk}"
SETUP_MODE=""
REFRESH_ONLY=0

usage() {
    cat <<USAGE
Usage: setup.sh [--mode prod|dev] [--refresh]

  --mode prod|dev  prod (default) runs the published image; dev runs the
                   hot-reload compose stack from the checkout.
  --refresh        Only re-install the host files from the checkout (compose
                   file, systemd units, helper scripts, sudoers, X/openbox
                   config, display agent). No apt, Docker or git. update-calvin.sh
                   runs this on every update.

Environment overrides:
  GIT_REPO, GIT_BRANCH, CALVIN_DIR, CALVIN_DATA_DIR, CALVIN_IMAGE_TAG
  GIT_BRANCH may be a branch (develop) or a release tag (v0.1.0; the image
  follows the tag). Pass them through sudo:
  sudo GIT_BRANCH=v0.1.0 bash setup.sh
USAGE
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
            --refresh)
                REFRESH_ONLY=1
                shift
                ;;
            --source-only)
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

    # A refresh keeps the mode the host was set up with.
    if [ -z "${SETUP_MODE}" ]; then
        SETUP_MODE="$(read_env_value "${CALVIN_DEFAULT_DIR:-/etc/default}/calvin-update" CALVIN_MODE)"
        SETUP_MODE="${SETUP_MODE:-prod}"
    fi
    if [ "${SETUP_MODE}" != "prod" ] && [ "${SETUP_MODE}" != "dev" ]; then
        echo "Invalid mode: ${SETUP_MODE}. Expected prod or dev." >&2
        exit 1
    fi
}

compose() {
    if docker compose version >/dev/null 2>&1; then
        docker compose "$@"
    elif command -v docker-compose >/dev/null 2>&1; then
        docker-compose "$@"
    else
        return 127
    fi
}

# Docker Engine + the compose plugin from Docker's own apt repo. Debian and
# Raspberry Pi OS (Bookworm, Trixie) ship docker.io but no compose v2 plugin, so
# the distro packages cannot run calvin-app.service. Left alone when a working
# `docker compose` is already there.
install_docker_runtime() {
    if docker compose version >/dev/null 2>&1; then
        log "Docker with the compose plugin is already installed"
    else
        log "Installing Docker CE + compose plugin from download.docker.com..."
        local os_release="${CALVIN_OS_RELEASE:-/etc/os-release}"
        local keyrings="${CALVIN_APT_KEYRINGS_DIR:-/etc/apt/keyrings}"
        local sources="${CALVIN_APT_SOURCES_DIR:-/etc/apt/sources.list.d}"
        local os_id codename repo_os arch
        # shellcheck disable=SC1090
        os_id="$(. "${os_release}" && echo "${ID:-}")"
        # shellcheck disable=SC1090
        codename="$(. "${os_release}" && echo "${VERSION_CODENAME:-}")"
        case "${os_id}" in
            debian|ubuntu) repo_os="${os_id}" ;;
            raspbian) repo_os="raspbian" ;;  # 32-bit Raspberry Pi OS (armhf)
            *) error_exit "Unsupported OS '${os_id}': install Docker with the compose plugin yourself, then re-run" 1 ;;
        esac
        [ -n "${codename}" ] || error_exit "No VERSION_CODENAME in ${os_release}" 1
        arch="$(dpkg --print-architecture)"
        install_system_packages ca-certificates curl
        # Docker does not publish every combination (e.g. no 32-bit raspbian
        # Trixie): fail with a pointer instead of an opaque apt error.
        local release_url="https://download.docker.com/linux/${repo_os}/dists/${codename}/Release" http_code
        http_code="$(curl -sSL -o /dev/null -w '%{http_code}' "${release_url}" || true)"
        case "${http_code}" in
            200) ;;
            404) error_exit "Docker publishes no packages for ${repo_os} ${codename} (${arch}). Use 64-bit Raspberry Pi OS (or Debian) Bookworm/Trixie." 1 ;;
            *) error_exit "Cannot reach download.docker.com (${release_url}: HTTP ${http_code:-none}); check the network and re-run" 1 ;;
        esac

        # docker-ce conflicts with the distro packages an older setup installed.
        local conflicts=() pkg
        for pkg in docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc; do
            if dpkg -s "${pkg}" >/dev/null 2>&1; then
                conflicts+=("${pkg}")
            fi
        done
        if [ "${#conflicts[@]}" -gt 0 ]; then
            log "Removing distro Docker packages: ${conflicts[*]}"
            apt_get remove -y -qq "${conflicts[@]}" || error_exit "Failed to remove ${conflicts[*]}" 1
        fi

        mkdir -p "${keyrings}" "${sources}"
        curl -fsSL "https://download.docker.com/linux/${repo_os}/gpg" -o "${keyrings}/docker.asc" \
            || error_exit "Failed to download Docker's apt key" 1
        chmod a+r "${keyrings}/docker.asc"
        printf 'deb [arch=%s signed-by=%s] https://download.docker.com/linux/%s %s stable\n' \
            "${arch}" "${keyrings}/docker.asc" "${repo_os}" "${codename}" > "${sources}/docker.list"
        apt_get update -qq || error_exit "Failed to update package lists (Docker repo for ${repo_os} ${codename})" 1
        install_system_packages docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    fi

    systemctl enable docker >/dev/null 2>&1 || log_warn "Failed to enable docker.service"
    systemctl start docker >/dev/null 2>&1 || log_warn "Failed to start docker.service"

    # The docker group is root-equivalent and calvin runs Chromium; root
    # (calvin-app.service, update-calvin.sh) is what drives Docker.
    if id -nG "${CALVIN_USER}" 2>/dev/null | tr ' ' '\n' | grep -qx docker; then
        log "Removing ${CALVIN_USER} from the docker group"
        gpasswd -d "${CALVIN_USER}" docker >/dev/null || log_warn "Failed to remove ${CALVIN_USER} from the docker group"
    fi

    if ! compose version >/dev/null 2>&1; then
        error_exit "Docker Compose is not available after installation" 1
    fi
}

# The container runs as root, so nothing but root and calvin needs access;
# an older setup's `chmod -R 755` made the DB world-readable.
create_runtime_data_dirs() {
    log "Creating Calvin runtime data directories under ${CALVIN_DATA_DIR}..."
    local d
    for d in "" /db /images /plugins /logs; do
        mkdir -p "${CALVIN_DATA_DIR}${d}"
        chown "${CALVIN_USER}:${CALVIN_USER}" "${CALVIN_DATA_DIR}${d}"
        chmod 0750 "${CALVIN_DATA_DIR}${d}"
    done
    chmod -R o-rwx "${CALVIN_DATA_DIR}"
}

# Every deployable branch runs the :develop image. A release install (a vX.Y.Z
# tag) runs that release's published image instead. Pin another tag with
# CALVIN_IMAGE_TAG.
image_tag_for_branch() {
    if is_release_tag "$1"; then
        echo "$1"
    else
        echo develop
    fi
}

# Keep CALVIN_IMAGE_TAG in step with the branch. latest/develop/empty are the
# values setup manages; any other value is an operator pin and is kept. A
# release ref owns its tag (so bumping GIT_BRANCH to a newer tag moves the
# image too). An explicit CALVIN_IMAGE_TAG in setup's environment always wins.
sync_image_tag() {
    local env_file="$1"
    local branch="$2"
    local current wanted
    current="$(read_env_value "${env_file}" CALVIN_IMAGE_TAG)"
    if [ -n "${CALVIN_IMAGE_TAG:-}" ]; then
        wanted="${CALVIN_IMAGE_TAG}"
    elif is_release_tag "${branch}"; then
        wanted="${branch}"
    else
        case "${current}" in
            ""|latest|develop) wanted="$(image_tag_for_branch "${branch}")" ;;
            *) log "Keeping pinned image tag ${current}"; return 0 ;;
        esac
    fi
    if [ "${current}" != "${wanted}" ]; then
        log "Image tag: ${current:-<unset>} -> ${wanted}"
        upsert_env_value "${env_file}" CALVIN_IMAGE_TAG "${wanted}"
    fi
}

calvin_port() {
    local port
    port="$(read_env_value "${CALVIN_ETC_DIR}/.env" CALVIN_PORT)"
    echo "${port:-8000}"
}

install_compose_config() {
    local mode="$1"
    local source_compose="${CALVIN_SOURCE_DIR}/docker/docker-compose.yml"

    if [ "${mode}" = "dev" ]; then
        source_compose="${CALVIN_SOURCE_DIR}/docker/docker-compose.dev.yml"
    fi

    # Production layout: both files live in /etc/calvin/. Compose
    # auto-loads /etc/calvin/.env when invoked with
    # `-f /etc/calvin/docker-compose.yml` — no env_file directive,
    # no path rewriting needed.
    log "Installing ${mode} compose configuration..."
    mkdir -p "${CALVIN_ETC_DIR}"

    if [ ! -f "${CALVIN_ETC_DIR}/.env" ]; then
        install -m 0640 "${CALVIN_SOURCE_DIR}/deploy/calvin.env.example" "${CALVIN_ETC_DIR}/.env"
        chown "root:${CALVIN_USER}" "${CALVIN_ETC_DIR}/.env"
    fi

    upsert_env_value "${CALVIN_ETC_DIR}/.env" CALVIN_DATA_DIR "${CALVIN_DATA_DIR}"
    sync_image_tag "${CALVIN_ETC_DIR}/.env" "${GIT_BRANCH}"
    if [ "${mode}" = "dev" ]; then
        # Dev compose bind-mounts the source tree at /app. Point it at
        # the actual checkout so the compose file can run from
        # /etc/calvin/ instead of the repo's docker/ dir.
        upsert_env_value "${CALVIN_ETC_DIR}/.env" CALVIN_REPO_DIR "${CALVIN_DIR}"
    fi

    # Validate next to the .env (compose loads .env from the file's directory)
    # before replacing the live file, so a bad file never lands.
    local candidate="${CALVIN_ETC_DIR}/.docker-compose.yml.new"
    install -m 0644 "${source_compose}" "${candidate}"
    if ! compose -f "${candidate}" config >/dev/null; then
        rm -f "${candidate}"
        error_exit "New Docker Compose configuration is invalid; kept the installed one" 1
    fi
    mv -f "${candidate}" "${CALVIN_ETC_DIR}/docker-compose.yml"
}

# P4: the screen on/off schedule needs vcgencmd/xset on the host; the container
# has neither. Same agent as on remote kiosks, pointed at the local server. No
# CALVIN_KIOSK_ID: it reads the global config instead of registering as a kiosk.
install_display_agent() {
    local port="$1"
    log "Installing the display-power agent (backend http://localhost:${port})..."
    mkdir -p "${CALVIN_BIN_DIR}" "${CALVIN_SYSTEMD_DIR}" "$(dirname "${CALVIN_KIOSK_ENV_FILE}")"
    install -m 0755 "${CALVIN_SOURCE_DIR}/deploy/kiosk-agent/calvin_display_agent.py" "${CALVIN_BIN_DIR}/calvin_display_agent.py"
    install -m 0644 "${CALVIN_SOURCE_DIR}/deploy/systemd/calvin-display-agent.service" "${CALVIN_SYSTEMD_DIR}/calvin-display-agent.service"
    [ -f "${CALVIN_KIOSK_ENV_FILE}" ] || install -m 0644 /dev/null "${CALVIN_KIOSK_ENV_FILE}"
    upsert_env_value "${CALVIN_KIOSK_ENV_FILE}" CALVIN_BACKEND_URL "http://localhost:${port}"
    systemctl enable calvin-display-agent.service >/dev/null 2>&1 || log_warn "Could not enable calvin-display-agent.service"
}

# Session env for the FULL kiosk (calvin-x.service + calvin-kiosk.service).
# calvin-kiosk.service reads it like calvin-kiosk-remote.service does, so the
# board-dependent Chromium flags from setup-common.sh apply here too: VC4-class
# boards (Pi 3/3B+, Zero 2 W, CM3) crash Chromium's renderer ("Aw, Snap! error
# 11") unless --disable-gpu is passed. Refresh only owns this file; the operator
# settings live in calvin-kiosk.
configure_kiosk_display_session() {
    log "Configuring the kiosk display session..."
    local before after env_file
    env_file="$(calvin_display_env_file)"
    before="$(read_env_value "${env_file}" CALVIN_CHROMIUM_DISPLAY_FLAGS)"
    mkdir -p "$(dirname "${CALVIN_KIOSK_ENV_FILE}")"
    [ -f "${CALVIN_KIOSK_ENV_FILE}" ] || install -m 0644 /dev/null "${CALVIN_KIOSK_ENV_FILE}"
    # Operator-visible override (auto|on|off, see chromium_display_flags). Only
    # seed it: a value set by hand, or by an earlier run, wins.
    if [ -z "$(read_env_value "${CALVIN_KIOSK_ENV_FILE}" CALVIN_CHROMIUM_GPU)" ]; then
        upsert_env_value "${CALVIN_KIOSK_ENV_FILE}" CALVIN_CHROMIUM_GPU "auto"
    fi
    # Mode A is X11-only (calvin-x.service), so no --ozone-platform flag; the GPU
    # flag still follows the board and CALVIN_CHROMIUM_GPU.
    configure_display_session x11 "${CALVIN_USER}" || return 1

    # A recomputed flag only takes effect when Chromium restarts, so an update
    # fixes a running Pi 3 now instead of at the next reboot. try-restart leaves
    # a stopped kiosk alone; on a first install the unit is not there yet.
    after="$(read_env_value "${env_file}" CALVIN_CHROMIUM_DISPLAY_FLAGS)"
    if [ "${before}" != "${after}" ] && [ -f "${CALVIN_SYSTEMD_DIR}/calvin-kiosk.service" ]; then
        log "Chromium flags changed; restarting calvin-kiosk.service"
        systemctl try-restart calvin-kiosk.service || log_warn "Could not restart calvin-kiosk.service"
    fi
}

install_helper_scripts() {
    install_privileged_sudo_helper_script "${CALVIN_SOURCE_DIR}/scripts/update-calvin.sh" "${CALVIN_BIN_DIR}/update-calvin.sh"
    install_privileged_sudo_helper_script "${CALVIN_SOURCE_DIR}/scripts/reboot-calvin.sh" "${CALVIN_BIN_DIR}/reboot-calvin.sh"
    install_privileged_sudo_helper_script "${CALVIN_SOURCE_DIR}/scripts/restart-calvin-services.sh" "${CALVIN_BIN_DIR}/restart-calvin-services.sh"
    # The sudoers rules name the canonical paths, not CALVIN_BIN_DIR.
    install_sudoers_fragment calvin-reboot "${CALVIN_USER} ALL=(root) NOPASSWD: /usr/local/bin/reboot-calvin.sh"
    install_sudoers_fragment calvin-restart "${CALVIN_USER} ALL=(root) NOPASSWD: /usr/local/bin/restart-calvin-services.sh"
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
        rm -f "${CALVIN_SYSTEMD_DIR}/${service}"
    done
    systemctl daemon-reload 2>/dev/null || true
}

systemd_available() {
    [ -d /run/systemd/system ] && systemctl list-unit-files >/dev/null 2>&1
}

install_runtime_services() {
    log "Installing systemd services..."
    install_systemd_service "${CALVIN_SOURCE_DIR}/deploy/systemd/calvin-app.service" "${CALVIN_DIR}"
    install_systemd_service "${CALVIN_SOURCE_DIR}/deploy/systemd/calvin-x.service" "${CALVIN_DIR}"
    install_systemd_service "${CALVIN_SOURCE_DIR}/deploy/systemd/calvin-kiosk.service" "${CALVIN_DIR}"

    if systemd_available; then
        enable_systemd_service "calvin-app.service"
        enable_systemd_service "calvin-x.service"
        enable_systemd_service "calvin-kiosk.service"
    else
        log_warn "systemd is not running; installed service files but skipped enable"
    fi
}

# Host files run as or are trusted by root, so they are not installed from the
# checkout in calvin's home (the app user can edit it) but from a fresh
# root-only clone. update-calvin.sh passes its own clone as CALVIN_SOURCE_DIR;
# the CI copy (CALVIN_SKIP_GIT_UPDATE) installs from the checkout itself.
resolve_source_dir() {
    if [ -n "${CALVIN_SOURCE_DIR}" ]; then
        return 0
    fi
    if [ "${CALVIN_SKIP_GIT_UPDATE:-}" = "1" ] || [ "${CALVIN_SKIP_GIT_UPDATE:-}" = "true" ]; then
        CALVIN_SOURCE_DIR="${CALVIN_DIR}"
        return 0
    fi
    log "Fetching ${GIT_REPO} (${GIT_BRANCH}) into a root-only snapshot to install the host files from..."
    CALVIN_SOURCE_DIR="$(prepare_source_snapshot "${GIT_REPO}" "${GIT_BRANCH}")" || exit 1
}

# Everything setup puts on the host outside the Docker volume. Run on every
# setup and, via --refresh, on every update.
refresh_host_files() {
    resolve_source_dir
    install_compose_config "${SETUP_MODE}"
    local port
    port="$(calvin_port)"

    install_helper_scripts
    configure_polkit_reboot "${CALVIN_USER}"
    create_update_config "${GIT_REPO}" "${GIT_BRANCH}" "${CALVIN_DIR}" "${SETUP_MODE}"
    configure_display "${CALVIN_USER}"
    configure_openbox_autostart "${CALVIN_USER}" "http://localhost:${port}" "false"
    install_display_agent "${port}"
    configure_kiosk_display_session
    install_runtime_services
    systemctl daemon-reload >/dev/null 2>&1 || log_warn "systemctl daemon-reload failed"
}

start_runtime_services() {
    log "Starting Calvin runtime services..."
    if systemd_available; then
        start_systemd_service "calvin-app.service"
        start_systemd_service "calvin-x.service"
        sleep 3
        start_systemd_service "calvin-kiosk.service"
        systemctl restart calvin-display-agent.service || log_warn "Could not start calvin-display-agent.service"
    else
        log_warn "systemd is not running; starting Docker Compose stack directly"
        compose -f "${CALVIN_ETC_DIR}/docker-compose.yml" up -d
    fi
}

verify_compose_runtime() {
    log "Verifying Docker Compose runtime..."
    verify_directory "${CALVIN_DIR}"
    verify_directory "${CALVIN_DATA_DIR}"
    verify_file "${CALVIN_ETC_DIR}/docker-compose.yml"
    verify_file "${CALVIN_ETC_DIR}/.env"

    if ! compose -f "${CALVIN_ETC_DIR}/docker-compose.yml" ps >/dev/null; then
        log_warn "Docker Compose stack is not queryable yet"
    fi

    log "Setup verification complete"
}

main() {
    parse_args "$@"
    require_fixed_calvin_user
    check_root
    mkdir -p "$(dirname "${LOG_FILE}")"

    if [ "${REFRESH_ONLY}" = 1 ]; then
        log "Refreshing Calvin host files from ${CALVIN_DIR} (mode ${SETUP_MODE})..."
        verify_directory "${CALVIN_DIR}"
        refresh_host_files
        if systemd_available; then
            systemctl try-restart calvin-display-agent.service || true
        fi
        log "Host files refreshed"
        return 0
    fi

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

    ensure_user_exists "${CALVIN_USER}"
    update_system_packages

    log "Installing kiosk and system dependencies..."
    install_system_packages git cron "${CALVIN_KIOSK_PACKAGES[@]}"

    install_docker_runtime
    configure_unattended_upgrades
    ensure_git_repo "${GIT_REPO}" "${GIT_BRANCH}" "${CALVIN_DIR}" "${CALVIN_USER}"
    create_runtime_data_dirs
    refresh_host_files

    disable_legacy_services
    start_runtime_services
    verify_compose_runtime

    local port
    port="$(calvin_port)"
    log ""
    log "=========================================="
    log "Calvin Raspberry Pi Setup Complete!"
    log "=========================================="
    log "Mode: ${SETUP_MODE}"
    log "Compose file: ${CALVIN_ETC_DIR}/docker-compose.yml"
    log "Environment file: ${CALVIN_ETC_DIR}/.env"
    log "Data directory: ${CALVIN_DATA_DIR}"
    log ""
    log "IMPORTANT: Reboot to start X and the dashboard:"
    log "  sudo reboot"
    log ""
    log "After reboot:"
    log "  - Docker Compose starts Calvin via calvin-app.service"
    log "  - Kiosk mode starts via calvin-kiosk.service"
    log "  - Dashboard is available at http://localhost:${port}"
    log ""
    log "To update Calvin in the future:"
    log "  sudo update-calvin.sh"
    log ""
}

# Sourced for testing: stop before running main.
[ "${_CALVIN_SOURCE_ONLY}" = "1" ] && return 0 2>/dev/null || true

main "$@"
