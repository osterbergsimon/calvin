#!/bin/bash
# Shared utilities for Calvin setup scripts
# This script provides common functions used by setup.sh
# Requires Python 3.12+ (see backend/pyproject.toml for exact requirements)

set -euo pipefail

# Color codes
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Default configuration
readonly DEFAULT_GIT_REPO="https://github.com/osterbergsimon/calvin.git"
# main is release-only and far behind; develop is the deploy branch.
readonly DEFAULT_GIT_BRANCH="develop"
readonly DEFAULT_CALVIN_DIR="/home/calvin/calvin"
readonly DEFAULT_CALVIN_USER="calvin"
readonly DEFAULT_LOG_FILE="/var/log/calvin-setup.log"

# Logging functions
log() {
    local message="$1"
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} ${message}" | tee -a "${LOG_FILE:-$DEFAULT_LOG_FILE}"
}

log_info() {
    local message="$1"
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO:${NC} ${message}" | tee -a "${LOG_FILE:-$DEFAULT_LOG_FILE}"
}

log_warn() {
    local message="$1"
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} ${message}" | tee -a "${LOG_FILE:-$DEFAULT_LOG_FILE}"
}

log_error() {
    local message="$1"
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} ${message}" | tee -a "${LOG_FILE:-$DEFAULT_LOG_FILE}"
}

error_exit() {
    local message="$1"
    local exit_code="${2:-1}"
    log_error "${message}"
    exit "${exit_code}"
}

# Validation functions
check_root() {
    if [ "$EUID" -ne 0 ]; then
        error_exit "This script must be run as root (use sudo)" 1
    fi
}

check_command() {
    local cmd="$1"
    local install_hint="${2:-}"
    
    if ! command -v "${cmd}" &> /dev/null; then
        if [ -n "${install_hint}" ]; then
            error_exit "${cmd} not found. ${install_hint}" 1
        else
            error_exit "${cmd} not found" 1
        fi
    fi
}

verify_directory() {
    local dir="$1"
    if [ ! -d "${dir}" ]; then
        error_exit "Directory does not exist: ${dir}" 1
    fi
}

verify_file() {
    local file="$1"
    if [ ! -f "${file}" ]; then
        error_exit "File does not exist: ${file}" 1
    fi
}

# The systemd units, sudoers fragments and kiosk bundle all hard-code the
# `calvin` user, so it is not configurable.
require_fixed_calvin_user() {
    if [ "${CALVIN_USER:-$DEFAULT_CALVIN_USER}" != "${DEFAULT_CALVIN_USER}" ]; then
        error_exit "CALVIN_USER must be ${DEFAULT_CALVIN_USER} (the systemd units and sudoers rules hard-code it); unset CALVIN_USER" 1
    fi
}

# User management
ensure_user_exists() {
    local username="${1:-$DEFAULT_CALVIN_USER}"
    
    if id "${username}" &>/dev/null; then
        log "User ${username} already exists"
        return 0
    fi
    
    log "Creating user ${username}..."
    useradd -m -s /bin/bash "${username}" || error_exit "Failed to create user ${username}" 1
    
    # Add user to necessary groups
    usermod -aG audio,video,plugdev,input "${username}" || log_warn "Failed to add user to some groups (non-fatal)"
    
    log "User ${username} created successfully"
}

# System package management
# Never prompt (a piped `curl | sudo bash` has no terminal), and keep locally
# modified config files on upgrade.
apt_get() {
    DEBIAN_FRONTEND=noninteractive apt-get \
        -o Dpkg::Options::=--force-confdef \
        -o Dpkg::Options::=--force-confold \
        "$@"
}

# apt is all-or-nothing: one bad package means none were installed, so a failure
# here must stop setup rather than carry on without X or Chromium.
update_system_packages() {
    log "Updating system packages..."
    apt_get update -qq || error_exit "Failed to update package list" 1
    apt_get upgrade -y -qq || error_exit "Failed to upgrade system packages (see apt output above)" 1
}

install_system_packages() {
    local packages=("$@")
    log "Installing system packages: ${packages[*]}"
    apt_get install -y -qq "${packages[@]}" || error_exit "Failed to install: ${packages[*]} (see apt output above)" 1
}

# X + Chromium kiosk packages, shared by setup.sh, setup-kiosk.sh and the CI
# package-availability smoke test. This is the X11 stack and stays installed even
# on a Wayland kiosk, so switching back is a unit switch rather than a reimage.
# shellcheck disable=SC2034  # used by the scripts that source this file
CALVIN_KIOSK_PACKAGES=(
    curl
    sudo
    xserver-xorg
    xinit
    openbox
    chromium
    unclutter
    xdotool
    x11-xserver-utils
)

# Extra packages for the opt-in Wayland stack (phase 1, SPLIT kiosks). Chromium
# comes from the shared list above. swayidle is only needed for idle blanking,
# which Calvin does not use: the schedule drives wlopm directly.
# shellcheck disable=SC2034  # used by the scripts that source this file
CALVIN_WAYLAND_PACKAGES=(
    labwc
    wlr-randr
    wlopm
    wtype
)

# Extra packages for the opt-in cog stack (WPE WebKit on DRM/KMS, no X and no
# compositor). Chromium + X11 stay installed from the shared list, so switching
# back is a unit switch, not a re-image. The DRM/Wayland/headless platform
# modules ship inside the cog package; gles rotation needs no extra package.
# shellcheck disable=SC2034  # used by the scripts that source this file
CALVIN_COG_PACKAGES=(
    cog
)

# UV installation and management
get_uv_path() {
    local user="${1:-$DEFAULT_CALVIN_USER}"
    echo "/home/${user}/.local/bin:/home/${user}/.cargo/bin:$PATH"
}

ensure_uv_installed() {
    local user="${1:-$DEFAULT_CALVIN_USER}"
    log "Checking UV installation for user ${user}..."
    
    if sudo -u "${user}" bash -c 'export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH" && command -v uv &> /dev/null'; then
        log "UV already installed for user ${user}"
        return 0
    fi
    
    log "Installing UV for user ${user}..."
    if ! sudo -u "${user}" bash << 'UV_INSTALL_EOF'
        export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
        if ! command -v uv &> /dev/null; then
            curl -LsSf https://astral.sh/uv/install.sh | sh || exit 1
            echo 'export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"' >> ~/.bashrc
            echo 'export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"' >> ~/.profile
            export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
        fi
        command -v uv &> /dev/null || { echo "ERROR: UV installation failed" >&2; exit 1; }
        uv --version
UV_INSTALL_EOF
    then
        error_exit "Failed to install UV for user ${user}" 1
    fi

    if ! sudo -u "${user}" bash -c 'export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH" && uv --version &> /dev/null'; then
        error_exit "Failed to install or verify UV for user ${user}" 1
    fi
    
    log "UV installed successfully for user ${user}"
}

# Node.js installation
ensure_nodejs_installed() {
    local min_version="${1:-20}"
    log "Checking Node.js installation (minimum version ${min_version})..."
    
    if command -v node &> /dev/null; then
        local current_version
        current_version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "${current_version}" -ge "${min_version}" ]; then
            log "Node.js $(node --version) already installed"
            return 0
        else
            log_warn "Node.js version ${current_version} is below minimum ${min_version}, will upgrade"
        fi
    fi
    
    log "Installing Node.js ${min_version}.x..."
    curl -fsSL "https://deb.nodesource.com/setup_${min_version}.x" | bash - || error_exit "Failed to setup Node.js repository" 1
    apt-get install -y -qq nodejs || error_exit "Failed to install Node.js" 1
    
    if ! command -v node &> /dev/null; then
        error_exit "Node.js installation verification failed" 1
    fi
    
    log "Node.js $(node --version) installed successfully"
}

# Git repository management
# Non-destructive: clones when missing, otherwise only fast-forwards. A dirty
# tree, local commits or another branch checked out are left alone with a
# warning (the docs tell users to edit their checkout; never wipe that).
ensure_git_repo() {
    local repo_url="${1:-$DEFAULT_GIT_REPO}"
    local branch="${2:-$DEFAULT_GIT_BRANCH}"
    local target_dir="${3:-$DEFAULT_CALVIN_DIR}"
    local user="${4:-$DEFAULT_CALVIN_USER}"

    if [ "${CALVIN_SKIP_GIT_UPDATE:-}" = "1" ] || [ "${CALVIN_SKIP_GIT_UPDATE:-}" = "true" ]; then
        log "Skipping Git repository update because CALVIN_SKIP_GIT_UPDATE is set"
        if [ -d "${target_dir}" ]; then
            chown -R "${user}:${user}" "${target_dir}"
        fi
        return 0
    fi

    log "Setting up Git repository: ${repo_url} (branch: ${branch})"

    if [ ! -d "${target_dir}" ]; then
        log "Cloning repository to ${target_dir}..."
        sudo -u "${user}" git clone --branch "${branch}" "${repo_url}" "${target_dir}" \
            || error_exit "Failed to clone ${repo_url} (branch ${branch})" 1
        log "Repository setup complete"
        return 0
    fi

    local g=(sudo -u "${user}" git -C "${target_dir}")
    log "Repository directory exists, updating (fast-forward only)..."
    "${g[@]}" fetch origin "${branch}" || error_exit "Failed to fetch ${branch} from origin" 1

    if [ -n "$("${g[@]}" status --porcelain --untracked-files=no)" ]; then
        log_warn "${target_dir} has local changes; leaving it as it is (commit or stash them, then re-run to update)"
        return 0
    fi

    local current_branch
    current_branch="$("${g[@]}" rev-parse --abbrev-ref HEAD)"
    if [ "${current_branch}" != "${branch}" ]; then
        if "${g[@]}" show-ref --verify --quiet "refs/heads/${branch}"; then
            "${g[@]}" checkout -q "${branch}" || error_exit "Failed to check out ${branch}" 1
        else
            "${g[@]}" checkout -q -b "${branch}" --track "origin/${branch}" \
                || error_exit "Failed to check out ${branch}" 1
        fi
    fi

    if ! "${g[@]}" merge -q --ff-only "origin/${branch}"; then
        log_warn "${target_dir} has local commits not on origin/${branch}; leaving them alone (rebase them to update)"
        return 0
    fi

    log "Repository setup complete"
}

# Backend dependency installation
install_backend_deps() {
    local calvin_dir="${1:-$DEFAULT_CALVIN_DIR}"
    local user="${2:-$DEFAULT_CALVIN_USER}"
    local extras="${3:-}"  # Optional comma-separated extras (e.g. "dev")
    local use_venv="${4:-false}"  # Use venv instead of UV (for dev on Pi 3B+)
    
    log "Installing backend dependencies (extras: ${extras})..."
    cd "${calvin_dir}/backend"
    chown -R "${user}:${user}" "${calvin_dir}"
    
    if [ "${use_venv}" = "true" ]; then
        log "Using venv for backend installation (development mode)..."
        sudo -u "${user}" bash << BACKEND_INSTALL_VENV_EOF || error_exit "Backend dependency installation failed" 1
            cd ${calvin_dir}/backend
            if [ ! -d .venv ]; then
                python3 -m venv .venv
            fi
            source .venv/bin/activate
            pip install --upgrade pip
            if [ -n "${extras}" ]; then
                pip install ".[${extras}]"
            else
                pip install .
            fi
BACKEND_INSTALL_VENV_EOF
    else
        log "Using UV for backend installation..."
        sudo -u "${user}" bash << BACKEND_INSTALL_UV_EOF || error_exit "Backend dependency installation failed" 1
            export PATH="/home/${user}/.local/bin:/home/${user}/.cargo/bin:\$PATH"
            cd ${calvin_dir}/backend
            # Convert comma-separated extras to multiple --extra flags for UV
            UV_EXTRAS=""
            if [ -n "${extras}" ]; then
                IFS=',' read -ra EXTRA_ARRAY <<< "${extras}"
                for extra in "\${EXTRA_ARRAY[@]}"; do
                    UV_EXTRAS="\${UV_EXTRAS} --extra \${extra}"
                done
            fi
            if [ -f uv.lock ]; then
                uv sync --frozen \${UV_EXTRAS} || uv sync \${UV_EXTRAS}
            else
                uv sync \${UV_EXTRAS}
            fi
BACKEND_INSTALL_UV_EOF
    fi
    
    log "Backend dependencies installed successfully"
}

# Frontend dependency installation
install_frontend_deps() {
    local calvin_dir="${1:-$DEFAULT_CALVIN_DIR}"
    local user="${2:-$DEFAULT_CALVIN_USER}"
    local production="${3:-false}"  # Use npm ci --production for production
    
    log "Installing frontend dependencies..."
    cd "${calvin_dir}/frontend"
    chown -R "${user}:${user}" "${calvin_dir}/frontend"
    
    if [ "${production}" = "true" ]; then
        log "Installing production dependencies only (npm ci --production)..."
        sudo -u "${user}" bash -c "cd '${calvin_dir}/frontend' && npm ci --production" || error_exit "Frontend production dependency installation failed" 1
    else
        log "Installing all dependencies (npm ci)..."
        sudo -u "${user}" bash -c "cd '${calvin_dir}/frontend' && npm ci" || error_exit "Frontend dependency installation failed" 1
    fi
    
    log "Frontend dependencies installed successfully"
}

# Download pre-built frontend from GitHub releases
# Returns 0 on success, 1 on failure
download_prebuilt_frontend() {
    local calvin_dir="${1:-$DEFAULT_CALVIN_DIR}"
    local user="${2:-$DEFAULT_CALVIN_USER}"
    local git_repo="${3:-$DEFAULT_GIT_REPO}"
    local git_branch="${4:-$DEFAULT_GIT_BRANCH}"
    
    log "Attempting to download pre-built frontend from GitHub releases..."
    
    # Extract repo owner and name from git URL
    # Supports: https://github.com/owner/repo.git or git@github.com:owner/repo.git
    local repo_owner repo_name
    if echo "${git_repo}" | grep -q "github.com[:/]"; then
        repo_owner=$(echo "${git_repo}" | sed -E 's|.*github\.com[:/]([^/]+)/([^/]+)(\.git)?$|\1|')
        repo_name=$(echo "${git_repo}" | sed -E 's|.*github\.com[:/]([^/]+)/([^/]+)(\.git)?$|\2|' | sed 's|\.git$||')
    else
        log_warn "Could not extract repo owner/name from ${git_repo}, skipping download"
        return 1
    fi
    
    # Get commit short hash from cloned repo
    local commit_hash
    commit_hash=$(sudo -u "${user}" bash -c "cd '${calvin_dir}' && git rev-parse --short HEAD" 2>/dev/null)
    if [ -z "${commit_hash}" ]; then
        log_warn "Could not get commit hash, skipping download"
        return 1
    fi
    
    # Get commit date (YYYY-MM-DD format) - CI/CD uses this date when creating the release
    local date_str
    date_str=$(sudo -u "${user}" bash -c "cd '${calvin_dir}' && git log -1 --format=%cd --date=short HEAD" 2>/dev/null)
    if [ -z "${date_str}" ]; then
        log_warn "Could not get commit date, skipping download"
        return 1
    fi
    
    # Determine release type and tag based on branch
    local release_tag
    if [ "${git_branch}" = "main" ]; then
        release_tag="stable-${date_str}-${commit_hash}"
    elif [ "${git_branch}" = "develop" ]; then
        release_tag="nightly-${date_str}-${commit_hash}"
    else
        log_warn "Branch ${git_branch} is not main or develop, skipping download"
        return 1
    fi
    
    # Construct download URL
    local download_url="https://github.com/${repo_owner}/${repo_name}/releases/download/${release_tag}/frontend-dist-${release_tag}.tar.gz"
    
    log "Downloading from: ${download_url}"
    
    # Create temporary directory for download
    local temp_dir
    temp_dir=$(mktemp -d)
    local temp_file="${temp_dir}/frontend-dist-${release_tag}.tar.gz"
    
    # Download the release asset
    if ! curl -fsSL -o "${temp_file}" "${download_url}" 2>/dev/null; then
        rm -rf "${temp_dir}"
        log_warn "Failed to download pre-built frontend (release may not exist or CI/CD build may have failed)"
        return 1
    fi
    
    # Verify the downloaded file exists and is not empty
    if [ ! -s "${temp_file}" ]; then
        rm -rf "${temp_dir}"
        log_warn "Downloaded file is empty, skipping"
        return 1
    fi
    
    # Extract to frontend/dist/ as root (since temp dir has restrictive permissions)
    log "Extracting pre-built frontend..."
    mkdir -p "${calvin_dir}/frontend/dist"
    if ! tar -xzf "${temp_file}" -C "${calvin_dir}/frontend" 2>/dev/null; then
        rm -rf "${temp_dir}"
        log_warn "Failed to extract pre-built frontend"
        return 1
    fi
    
    # Change ownership of extracted files to user
    chown -R "${user}:${user}" "${calvin_dir}/frontend/dist" || {
        rm -rf "${temp_dir}"
        log_warn "Failed to change ownership of extracted files"
        return 1
    }
    
    # Verify dist/index.html exists
    if ! sudo -u "${user}" bash -c "test -f '${calvin_dir}/frontend/dist/index.html'" 2>/dev/null; then
        rm -rf "${temp_dir}"
        log_warn "Extracted dist/ directory is invalid (missing index.html)"
        return 1
    fi
    
    # Cleanup
    rm -rf "${temp_dir}"
    
    log "Successfully downloaded and extracted pre-built frontend"
    return 0
}

# Build frontend
build_frontend() {
    local calvin_dir="${1:-$DEFAULT_CALVIN_DIR}"
    local user="${2:-$DEFAULT_CALVIN_USER}"
    
    log "Building frontend..."
    
    # Check if vite is available (needed for build)
    if ! sudo -u "${user}" bash -c "cd '${calvin_dir}/frontend' && test -f node_modules/.bin/vite" 2>/dev/null; then
        error_exit "vite not found in node_modules/.bin/vite - frontend dependencies may not be installed correctly" 1
    fi
    
    sudo -u "${user}" bash -c "cd '${calvin_dir}/frontend' && npm run build" || error_exit "Frontend build failed" 1
    log "Frontend built successfully"
}

# Data directory creation
create_data_directories() {
    local calvin_dir="${1:-$DEFAULT_CALVIN_DIR}"
    local user="${2:-$DEFAULT_CALVIN_USER}"
    
    log "Creating data directories..."
    mkdir -p "${calvin_dir}/backend/data/db"
    mkdir -p "${calvin_dir}/backend/data/images"
    mkdir -p "${calvin_dir}/backend/data/cache/images"
    mkdir -p "${calvin_dir}/backend/logs"
    
    chown -R "${user}:${user}" "${calvin_dir}/backend/data"
    chown -R "${user}:${user}" "${calvin_dir}/backend/logs"
    chmod -R 755 "${calvin_dir}/backend/data"
    chmod -R 755 "${calvin_dir}/backend/logs"
    
    # Verify directories were created
    verify_directory "${calvin_dir}/backend/data/db"
    verify_directory "${calvin_dir}/backend/data/images"
    verify_directory "${calvin_dir}/backend/logs"
    
    log "Data directories created successfully"
}

# Systemd service management
install_systemd_service() {
    local service_file="${1}"
    local calvin_dir="${2:-$DEFAULT_CALVIN_DIR}"
    
    if [ ! -f "${service_file}" ]; then
        error_exit "Service file does not exist: ${service_file}" 1
    fi
    
    local service_name
    service_name=$(basename "${service_file}")
    local target_file="${CALVIN_SYSTEMD_DIR:-/etc/systemd/system}/${service_name}"
    
    if [ -f "${target_file}" ]; then
        log "Overwriting existing systemd service: ${service_name}"
    else
        log "Installing systemd service: ${service_name}"
    fi
    
    mkdir -p "$(dirname "${target_file}")"
    install -m 0644 "${service_file}" "${target_file}" || error_exit "Failed to copy service file" 1
    # systemctl daemon-reload may fail in CI environments without systemd, but file is still installed
    if ! systemctl daemon-reload 2>/dev/null; then
        log_warn "systemctl daemon-reload failed (non-fatal, may be running in CI environment without systemd)"
    fi
    log "Service ${service_name} installed"
}

enable_systemd_service() {
    local service_name="${1}"
    log "Enabling systemd service: ${service_name}"
    systemctl enable "${service_name}" || error_exit "Failed to enable service ${service_name}" 1
}

start_systemd_service() {
    local service_name="${1}"
    log "Starting systemd service: ${service_name}"
    systemctl start "${service_name}" || error_exit "Failed to start service ${service_name}" 1
}

# Script installation
# Scripts run as root (directly or via a sudoers NOPASSWD rule) must NOT be owned
# by the Calvin user, or the app could edit them and escalate. Installed
# root:root 0755 through `install`, which writes a new inode, so replacing a
# script that is running right now (update-calvin.sh refreshing itself) is safe.
install_privileged_sudo_helper_script() {
    local script_path="${1}"
    local target_path="${2}"

    if [ ! -f "${script_path}" ]; then
        log_warn "Script file does not exist: ${script_path}, skipping installation"
        return 0
    fi

    log "Installing root-owned script (not writable by the app user): $(basename "${script_path}")"
    mkdir -p "$(dirname "${target_path}")"
    install -m 0755 "${script_path}" "${target_path}" || error_exit "Failed to install ${target_path}" 1
    if [ "$(id -u)" -eq 0 ]; then
        chown root:root "${target_path}" || error_exit "Failed to set script ownership" 1
    fi
    log "Script installed: ${target_path} (root:root 0755)"
}

# Install /etc/sudoers.d/<name> only after `visudo -c` accepts it: a broken
# fragment disables sudo for everyone. Names with '.' or '~' are silently
# skipped by #includedir, so they are refused.
install_sudoers_fragment() {
    local name="$1"
    local content="$2"
    local dir="${CALVIN_SUDOERS_DIR:-/etc/sudoers.d}"
    local visudo="${CALVIN_VISUDO:-visudo}"

    case "${name}" in
        ''|*.*|*~*|*/*) error_exit "Invalid sudoers fragment name: ${name}" 1 ;;
    esac

    local tmp
    tmp="$(mktemp)"
    printf '%s\n' "${content}" > "${tmp}"
    if ! "${visudo}" -c -q -f "${tmp}" >/dev/null; then
        rm -f "${tmp}"
        error_exit "sudoers fragment ${name} failed visudo -c; not installed" 1
    fi
    mkdir -p "${dir}"
    install -m 0440 "${tmp}" "${dir}/${name}" || { rm -f "${tmp}"; error_exit "Failed to install ${dir}/${name}" 1; }
    rm -f "${tmp}"
    log "Installed sudoers fragment ${dir}/${name}"
}

# Install a single authorized SSH public key for a user, idempotently.
# CALVIN_HOME_OVERRIDE lets tests point the home root at a temp dir.
install_authorized_key() {
    local user="$1"
    local pubkey="$2"
    [ -n "${pubkey}" ] || return 0

    local home_root="${CALVIN_HOME_OVERRIDE:-/home}"
    local ssh_dir="${home_root}/${user}/.ssh"
    local auth="${ssh_dir}/authorized_keys"

    mkdir -p "${ssh_dir}"
    chmod 700 "${ssh_dir}"
    touch "${auth}"
    if ! grep -qF "${pubkey}" "${auth}"; then
        printf '%s\n' "${pubkey}" >> "${auth}"
    fi
    chmod 600 "${auth}"
    # chown only when the target user actually exists (skipped in tests).
    if id "${user}" >/dev/null 2>&1 && [ -z "${CALVIN_HOME_OVERRIDE:-}" ]; then
        chown -R "${user}:${user}" "${ssh_dir}"
    fi
}

# Idempotent KEY=VALUE upsert in a `.env`-style file. Adds the line if
# missing, replaces it if present, and leaves every other line alone. Skips
# quoting — values must already be in shell-friendly form. awk (not sed) so a
# value containing |, & or \ is written literally.
upsert_env_value() {
    local file="$1"
    local key="$2"
    local value="$3"

    if [ ! -f "${file}" ]; then
        printf '%s=%s\n' "${key}" "${value}" > "${file}"
        return
    fi

    local tmp
    tmp="$(mktemp)"
    UPSERT_KEY="${key}" UPSERT_VALUE="${value}" awk '
        BEGIN { k = ENVIRON["UPSERT_KEY"]; v = ENVIRON["UPSERT_VALUE"]; done = 0 }
        index($0, k "=") == 1 { if (!done) print k "=" v; done = 1; next }
        { print }
        END { if (!done) print k "=" v }
    ' "${file}" > "${tmp}"
    # Rewrite in place: keeps the file's owner and mode.
    cat "${tmp}" > "${file}"
    rm -f "${tmp}"
}

# Value of KEY in a `.env`-style file (empty if missing). Never sources it.
read_env_value() {
    local file="$1"
    local key="$2"
    [ -f "${file}" ] || return 0
    grep "^${key}=" "${file}" 2>/dev/null | tail -n 1 | cut -d= -f2- | tr -d "\"'" || true
}

# Configuration file creation
# Upserts the keys setup owns; operator keys (WAIT_TIMEOUT, ...) are kept.
create_update_config() {
    local git_repo="${1:-$DEFAULT_GIT_REPO}"
    local git_branch="${2:-$DEFAULT_GIT_BRANCH}"
    local repo_dir="${3:-$DEFAULT_CALVIN_DIR}"
    local calvin_mode="${4:-prod}"
    local conf="${CALVIN_DEFAULT_DIR:-/etc/default}/calvin-update"

    log "Creating update configuration..."
    mkdir -p "$(dirname "${conf}")"
    [ -f "${conf}" ] || install -m 0644 /dev/null "${conf}"
    upsert_env_value "${conf}" GIT_REPO "${git_repo}"
    upsert_env_value "${conf}" GIT_BRANCH "${git_branch}"
    upsert_env_value "${conf}" REPO_DIR "${repo_dir}"
    upsert_env_value "${conf}" CALVIN_MODE "${calvin_mode}"
    log "Update configuration saved to ${conf}"
}

# Root-only state dir for setup/updates (source snapshot, rollback copies).
# Refuses a directory someone else owns or can write: the app user must not be
# able to pre-create it and feed root its files.
ensure_update_dir() {
    local dir="${CALVIN_UPDATE_DIR:-/var/lib/calvin-update}"
    (umask 077 && mkdir -p "${dir}")
    if [ "$(stat -c %u "${dir}")" != "$(id -u)" ] || [ -n "$(find "${dir}" -maxdepth 0 -perm /022)" ]; then
        # >&2: callers capture stdout with $(...), so the reason must not land there.
        error_exit "${dir} is not owned by $(id -un) or is writable by others; refusing to use it" 1 >&2
    fi
    chmod 0700 "${dir}"
    echo "${dir}"
}

# Fresh shallow clone of <repo> <branch> into the root-only update dir; prints
# its path. Host files (units, sudo helpers, the updater) are installed from
# here, never from the checkout in calvin's home, which the app user can edit.
prepare_source_snapshot() {
    local repo="$1"
    local branch="$2"
    local dir src
    # error_exit inside $(...) only ends the subshell: propagate it.
    dir="$(ensure_update_dir)" || exit 1
    src="${dir}/src"
    rm -rf "${src}"
    git clone -q --depth 1 --branch "${branch}" "${repo}" "${src}" 2>/dev/null \
        || git clone -q --branch "${branch}" "${repo}" "${src}" \
        || error_exit "Could not fetch ${repo} (${branch}) to install the host files from (root clones it: use an https URL)" 1 >&2
    echo "${src}"
}

# Swap file management (for development on Pi 3B+)
setup_swap_file() {
    local swap_size="${1:-4G}"
    local swap_file="/swapfile"
    
    if [ -f "${swap_file}" ]; then
        log "Swap file already exists"
        local current_size
        current_size=$(stat -f%z "${swap_file}" 2>/dev/null || stat -c%s "${swap_file}" 2>/dev/null || echo "0")
        local current_size_gb=$((current_size / 1024 / 1024 / 1024))
        local desired_size_gb
        desired_size_gb="${swap_size//G/}"
        
        if [ "${current_size_gb}" -lt "${desired_size_gb}" ]; then
            log "Swap file is ${current_size_gb}GB, enlarging to ${swap_size}..."
            swapoff "${swap_file}" 2>/dev/null || true
            rm -f "${swap_file}"
            fallocate -l "${swap_size}" "${swap_file}" 2>/dev/null || dd if=/dev/zero of="${swap_file}" bs=1M count=$((desired_size_gb * 1024)) status=progress
            chmod 600 "${swap_file}"
            mkswap "${swap_file}"
            swapon "${swap_file}"
            log "Swap enlarged to ${swap_size}"
        fi
        
        if ! swapon --show | grep -q swapfile; then
            swapon "${swap_file}"
            log "Swap activated"
        fi
        return 0
    fi
    
    log "Creating ${swap_size} swap file (this may take a few minutes)..."
    local desired_size_gb
    desired_size_gb="${swap_size//G/}"
    fallocate -l "${swap_size}" "${swap_file}" 2>/dev/null || dd if=/dev/zero of="${swap_file}" bs=1M count=$((desired_size_gb * 1024)) status=progress
    chmod 600 "${swap_file}"
    mkswap "${swap_file}"
    swapon "${swap_file}"
    echo "${swap_file} none swap sw 0 0" >> /etc/fstab
    log "Swap file created and activated"
}

# Polkit configuration
configure_polkit_reboot() {
    local user="${1:-$DEFAULT_CALVIN_USER}"
    
    local rules_dir="${CALVIN_POLKIT_DIR:-/etc/polkit-1/rules.d}"

    log "Configuring polkit for reboot..."
    mkdir -p "${rules_dir}"
    cat > "${rules_dir}/50-calvin-reboot.rules" << POLKIT_EOF
polkit.addRule(function(action, subject) {
    if (action.id == "org.freedesktop.login1.reboot" ||
        action.id == "org.freedesktop.login1.reboot-multiple-sessions" ||
        action.id == "org.freedesktop.login1.power-off" ||
        action.id == "org.freedesktop.login1.power-off-multiple-sessions") {
        if (subject.user == "${user}") {
            return polkit.Result.YES;
        }
    }
});
POLKIT_EOF
    chmod 644 "${rules_dir}/50-calvin-reboot.rules"
    log "Polkit reboot rules configured"
}

# Write a file into another user's home as root without following a symlink
# the app user planted at that name (calvin-1g25). A fixed-name `cat >` opened
# the symlink; `install -T` unlinks the destination and creates a fresh inode
# owned by the target user. The content comes from a private root temp file
# that the app user cannot replace.
install_user_file() {  # dest mode owner ; content on stdin
    local dest="$1" mode="$2" owner="$3"
    local src opts=() rc=0
    src="$(mktemp)" || return 1
    cat > "$src"
    chmod "$mode" "$src"
    opts=(-T -m "$mode")
    if [ "$(id -u)" -eq 0 ] && id -u "$owner" >/dev/null 2>&1; then
        opts+=(-o "$owner" -g "$owner")
    fi
    install "${opts[@]}" "$src" "$dest" || rc=$?
    rm -f "$src"
    return "$rc"
}

# Display configuration
# calvin-x.service is the only thing that starts X on tty1. Older setups also
# added getty autologin + `exec startx` in .bash_profile, which raced the unit
# for :0; those copies are removed here (only when they are the ones setup wrote).
configure_display() {
    local user="${1:-$DEFAULT_CALVIN_USER}"
    local user_home="${CALVIN_HOME_OVERRIDE:-/home}/${user}"
    local systemd_dir="${CALVIN_SYSTEMD_DIR:-/etc/systemd/system}"

    log "Configuring display settings..."

    # .xprofile
    install_user_file "${user_home}/.xprofile" 0755 "$user" << 'XPROFILE_EOF'
#!/bin/bash
xset s off
xset -dpms
xset s noblank
XPROFILE_EOF

    # .xinitrc (what startx in calvin-x.service runs)
    install_user_file "${user_home}/.xinitrc" 0755 "$user" << 'EOF'
#!/bin/sh
exec openbox-session
EOF

    local autologin="${systemd_dir}/getty@tty1.service.d/autologin.conf"
    if [ -f "${autologin}" ] && grep -q -- "--autologin ${user} " "${autologin}"; then
        log "Removing the old ${user} tty1 autologin (calvin-x.service starts X now)"
        rm -f "${autologin}"
        rmdir "$(dirname "${autologin}")" 2>/dev/null || true
    fi
    local profile="${user_home}/.bash_profile"
    local old_profile
    # shellcheck disable=SC2016  # literal file content, not an expansion
    old_profile='if [ -z "$DISPLAY" ] && [ -n "$XDG_VTNR" ] && [ "$XDG_VTNR" -eq 1 ]; then
    exec startx
fi'
    if [ -f "${profile}" ] && [ "$(cat "${profile}")" = "${old_profile}" ]; then
        rm -f "${profile}"
    fi

    # calvin-x.service declares Conflicts=getty@tty1.service; keep getty from
    # being started for tty1 at boot as well (other VTs still get a login).
    systemctl disable getty@tty1.service >/dev/null 2>&1 || true

    log "Display configuration complete"
}

# Automatic security updates for the OS and Chromium (P9). Debian's defaults
# cover Debian + Debian-Security; Raspberry Pi OS ships Chromium from its own
# archive, so add that (and the 32-bit Raspbian archive) explicitly.
configure_unattended_upgrades() {
    local conf_dir="${CALVIN_APT_CONF_DIR:-/etc/apt/apt.conf.d}"
    log "Enabling unattended-upgrades..."
    install_system_packages unattended-upgrades
    mkdir -p "${conf_dir}"
    cat > "${conf_dir}/20auto-upgrades" <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
    cat > "${conf_dir}/52calvin-unattended-upgrades" <<'EOF'
// Written by Calvin setup: also keep Raspberry Pi OS packages (Chromium,
// firmware, kernel) up to date, not only Debian's.
Unattended-Upgrade::Origins-Pattern {
        "origin=Raspberry Pi Foundation,codename=${distro_codename},label=Raspberry Pi Foundation";
        "origin=Raspbian,codename=${distro_codename},label=Raspbian";
};
EOF
}

# Openbox autostart configuration
configure_openbox_autostart() {
    local user="${1:-$DEFAULT_CALVIN_USER}"
    local user_home="${CALVIN_HOME_OVERRIDE:-/home}/${user}"
    local frontend_url="${2:-http://localhost:8000}"  # Default to production
    local start_chromium="${3:-true}"  # Whether to start Chromium (default true for backward compatibility)
    
    log "Configuring Openbox autostart..."
    mkdir -p "${user_home}/.config/openbox"
    
    # Build autostart script
    {
        echo "#!/bin/bash"
        if [ "${start_chromium}" = "true" ]; then
            echo "# Wait for backend to be ready"
            echo "while ! curl -s ${frontend_url%/}/api/health > /dev/null; do"
            echo "    sleep 1"
            echo "done"
            echo ""
            # Add frontend wait if dev mode (port 5173)
            if echo "${frontend_url}" | grep -q ":5173"; then
                echo "# Wait for frontend dev server to be ready"
                echo "while ! curl -s http://localhost:5173 > /dev/null; do"
                echo "    sleep 1"
                echo "done"
                echo ""
            fi
            echo "# Start Chromium in kiosk mode"
            echo "chromium \\"
            echo "    --kiosk \\"
            echo "    --noerrdialogs \\"
            echo "    --disable-infobars \\"
            echo "    --autoplay-policy=no-user-gesture-required \\"
            echo "    --disable-features=TranslateUI \\"
            echo "    --disable-ipc-flooding-protection \\"
            echo "    ${frontend_url} &"
            echo ""
        else
            echo "# Chromium is managed by systemd service (calvin-kiosk.service)"
            echo "# No need to start it here"
            echo ""
        fi
        echo "# Disable automatic screen blanking; keep DPMS available for scheduled off"
        echo "xset s off &"
        echo "xset s noblank &"
        echo "xset +dpms &"
        echo "xset dpms 0 0 0 &"
        echo ""
        echo "# Hide cursor after 3 seconds"
        echo "unclutter -idle 3 -root &"
    } > "${user_home}/.config/openbox/autostart"
    
    chmod +x "${user_home}/.config/openbox/autostart"
    chown -R "${user}:${user}" "${user_home}/.config"
    
    log "Openbox autostart configured"
}

# Display stack selection (phase 1: Wayland and cog are opt-in, X11 is default)
# ---------------------------------------------------------------------------
# CALVIN_DISPLAY_STACK (environment, then /etc/default/calvin-kiosk) or the
# installer's --display-stack flag picks the stack. `auto` stays X11 on every
# model in this phase, including Pi 3-class boards: flipping auto to cog is a
# separate change after real-hardware checks (docs/research/2026-10-29-kiosk-cog.md).

# Session env file shared by calvin-kiosk-remote.service and
# calvin-display-agent.service, so one file selects the stack for both instead of
# duplicating the units.
calvin_display_env_file() {
    printf '%s\n' "${CALVIN_KIOSK_DISPLAY_ENV_FILE:-/etc/default/calvin-kiosk-display}"
}

# Echo the stack to use: x11, wayland or cog. $1 is the explicit --display-stack
# value (empty when not given); otherwise the environment, then `auto` (-> x11).
resolve_display_stack() {
    local requested="${1:-${CALVIN_DISPLAY_STACK:-auto}}"
    case "${requested}" in
        x11|wayland|cog)
            printf '%s\n' "${requested}"
            ;;
        auto|"")
            printf 'x11\n'
            ;;
        *)
            echo "Invalid display stack: ${requested} (expected auto, x11, wayland or cog)" >&2
            return 1
            ;;
    esac
}

# Extra packages a stack needs; X11's CALVIN_KIOSK_PACKAGES are always installed.
display_stack_packages() {
    case "${1:-x11}" in
        wayland) printf '%s\n' "${CALVIN_WAYLAND_PACKAGES[@]}" ;;
        cog) printf '%s\n' "${CALVIN_COG_PACKAGES[@]}" ;;
        *) return 0 ;;
    esac
}

# Chromium's GPU path (calvin-scuh)
# ---------------------------------------------------------------------------
# VC4-class boards (Pi 3 family, Zero 2 W, CM3) expose OpenGL ES 2.0 through
# Mesa's vc4 driver. Chromium's GPU process segfaults there within seconds
# ("Aw, Snap! error 11"), so the renderer never stays up; --disable-gpu makes
# the same dashboard load reliably. Pi 4/5 have a usable GPU path and keep it.
# CALVIN_CHROMIUM_GPU=auto|on|off: the environment wins over /etc/default/calvin-kiosk,
# then `auto` decides from the board. `on` never adds the flag, `off` always does.
# The device-tree model path is overridable so tests can fake a board.
calvin_device_tree_model_file() {
    printf '%s\n' "${CALVIN_DEVICE_TREE_MODEL:-/proc/device-tree/model}"
}

# The board's model string, e.g. "Raspberry Pi 3 Model B Plus Rev 1.3". Empty on
# a non-Pi host or when the file is missing/empty. The real file is NUL-terminated.
calvin_board_model() {
    local file
    file="$(calvin_device_tree_model_file)"
    [ -r "${file}" ] || return 0
    tr -d '\000' < "${file}" | sed -e 's/[[:space:]]*$//'
}

board_is_vc4_class() {
    case "${1:-}" in
        *"Raspberry Pi 3"*|*"Raspberry Pi Zero 2"*|*"Compute Module 3"*) return 0 ;;
        *) return 1 ;;
    esac
}

# Echo the resolved setting (auto|on|off). An invalid value is a setup error, not
# a silent fallback: a typo must not decide whether the dashboard stays up.
resolve_chromium_gpu() {
    local env_file="${CALVIN_KIOSK_ENV_FILE:-/etc/default/calvin-kiosk}"
    local requested="${CALVIN_CHROMIUM_GPU:-}"
    if [ -z "${requested}" ]; then
        requested="$(read_env_value "${env_file}" CALVIN_CHROMIUM_GPU)"
    fi
    requested="${requested:-auto}"
    case "${requested}" in
        auto|on|off) printf '%s\n' "${requested}" ;;
        *)
            echo "Invalid CALVIN_CHROMIUM_GPU: ${requested} (expected auto, on or off)" >&2
            return 1
            ;;
    esac
}

# The stack's Chromium flags, in the order the kiosk unit passes them. $2/$3 let
# a caller stand in for the setting and the board model; empty means resolve them.
chromium_display_flags() {
    local stack="${1:-x11}"
    local gpu="${2:-}"
    local model="${3:-}"
    local disable_gpu=0
    local -a flags=()

    if [ -z "${gpu}" ]; then gpu="$(resolve_chromium_gpu)" || return 1; fi
    [ -n "${model}" ] || model="$(calvin_board_model)"
    case "${gpu}" in
        off) disable_gpu=1 ;;
        auto) board_is_vc4_class "${model}" && disable_gpu=1 ;;
    esac

    [ "${stack}" = "wayland" ] && flags+=("--ozone-platform=wayland")
    [ "${disable_gpu}" = 1 ] && flags+=("--disable-gpu")
    local IFS=' '
    printf '%s\n' "${flags[*]:-}"
}

# Write the session environment for the stack. X11 keeps DISPLAY/XAUTHORITY;
# Wayland needs the three variables Chromium and wlroots clients read, and has no
# X authority file at all. CALVIN_CHROMIUM_DISPLAY_FLAGS carries the stack flag
# (--ozone-platform=wayland) plus --disable-gpu on VC4-class boards, so the kiosk
# unit keeps a single, unchanged flag list. The file is rewritten whole, so a
# re-run replaces the flags instead of appending them again.
configure_display_session() {
    local stack="$1"
    local user="${2:-$DEFAULT_CALVIN_USER}"
    local home="${CALVIN_HOME_OVERRIDE:-/home}/${user}"
    local file uid flags
    file="$(calvin_display_env_file)"
    uid="$(id -u "${user}" 2>/dev/null || echo 1000)"
    flags="$(chromium_display_flags "${stack}")" || return 1

    log "Configuring ${stack} session environment (${file})..."
    mkdir -p "$(dirname "${file}")"
    if [ "${stack}" = "cog" ]; then
        cat > "${file}" <<COG_ENV_EOF
# Calvin kiosk display session (stack: cog). Written by the Calvin setup scripts
# (setup.sh for the all-in-one install, setup-kiosk.sh for a remote kiosk).
# cog owns DRM/KMS directly: there is no X server, no compositor, no
# DISPLAY/XAUTHORITY or WAYLAND_DISPLAY to publish. The unit reads the backend
# URL from /etc/default/calvin-kiosk and the rotation from
# /etc/default/calvin-kiosk-cog; Chromium is not started on this stack.
CALVIN_CHROMIUM_DISPLAY_FLAGS=
COG_ENV_EOF
    elif [ "${stack}" = "wayland" ]; then
        cat > "${file}" <<WAYLAND_ENV_EOF
# Calvin kiosk display session (stack: wayland). Written by the Calvin setup
# scripts (setup.sh for the all-in-one install, setup-kiosk.sh for a remote kiosk).
# Sets the environment calvin-kiosk-remote.service and calvin-display-agent.service
# need to reach the labwc session; there is no X authority file on Wayland.
XDG_SESSION_TYPE=wayland
WAYLAND_DISPLAY=wayland-0
XDG_RUNTIME_DIR=/run/user/${uid}
CALVIN_CHROMIUM_DISPLAY_FLAGS=${flags}
WAYLAND_ENV_EOF
    else
        cat > "${file}" <<X11_ENV_EOF
# Calvin kiosk display session (stack: x11). Written by the Calvin setup scripts
# (setup.sh for the all-in-one install, setup-kiosk.sh for a remote kiosk).
DISPLAY=:0
XAUTHORITY=${home}/.Xauthority
CALVIN_CHROMIUM_DISPLAY_FLAGS=${flags}
X11_ENV_EOF
    fi
    chmod 0644 "${file}"
}

# labwc autostart + rc.xml for the Wayland session. The autostart is the same
# file the kiosk bundle ships (deploy/kiosk-agent/labwc/autostart), so a bundle
# update and a setup run cannot drift apart; scripts/tests checks they match.
configure_labwc_autostart() {
    local user="${1:-$DEFAULT_CALVIN_USER}"
    local user_home="${CALVIN_HOME_OVERRIDE:-/home}/${user}"
    local dir="${user_home}/.config/labwc"

    log "Configuring labwc (Wayland) autostart..."
    mkdir -p "${dir}"
    cat > "${dir}/autostart" <<'LABWC_AUTOSTART_EOF'
#!/bin/sh
# Calvin kiosk - labwc autostart (Wayland session).
#
# Chromium is NOT started here: calvin-kiosk-remote.service starts it with the
# session environment and its own restart policy. This script only prepares the
# output and hides the pointer.

# rc.xml sets <autoEnableOutputs>no</autoEnableOutputs> so a scheduled
# `wlopm --off` is not undone by a monitor that fakes a hotplug. Enable the
# display that is present at boot instead.
out="$(wlr-randr 2>/dev/null | grep -E '^[^[:space:]]' | head -n 1 | awk '{print $1}')"
if [ -n "$out" ]; then
    wlr-randr --output "$out" --on >/dev/null 2>&1 || true
fi

# labwc has no idle cursor hiding; rc.xml binds W-c to HideCursor+WarpCursor and
# this fires it once through a virtual keyboard (labwc's documented workaround).
if command -v wtype >/dev/null 2>&1; then
    wtype -M logo -k c >/dev/null 2>&1 || true
fi

exit 0
LABWC_AUTOSTART_EOF
    cat > "${dir}/rc.xml" <<'LABWC_RC_EOF'
<?xml version="1.0"?>
<labwc_config>
  <!-- Calvin kiosk display settings (Wayland). Installed by setup and refreshed
       from the kiosk bundle on update; local edits are overwritten. -->
  <core>
    <!-- Do not re-enable an output the display agent turned off: a monitor that
         fakes a hotplug would otherwise wake the panel at night. The autostart
         script enables the output present at boot. -->
    <autoEnableOutputs>no</autoEnableOutputs>
  </core>

  <keyboard>
    <!-- Fired once at startup by autostart (wtype) to hide the pointer. There is
         no idle-hide in labwc; the cursor reappears on pointer/touch input. -->
    <keybind key="W-c">
      <action name="HideCursor" />
      <action name="WarpCursor" x="-1" y="-1" />
    </keybind>
  </keyboard>
</labwc_config>
LABWC_RC_EOF
    chmod 0755 "${dir}/autostart"
    chmod 0644 "${dir}/rc.xml"
    chown -R "${user}:${user}" "${dir}" 2>/dev/null || true

    log "labwc autostart configured"
}

# The cog unit reads its rotation from this file (EnvironmentFile=); the display
# agent's root helper rewrites it when the Kiosks setting changes. Optional for
# the unit (default 0), but seeding it makes the first boot explicit.
calvin_cog_rotation_file() {
    printf '%s\n' "${CALVIN_KIOSK_COG_ENV_FILE:-/etc/default/calvin-kiosk-cog}"
}

configure_cog_rotation() {
    local file
    file="$(calvin_cog_rotation_file)"
    # Never clobber a rotation the agent persisted (it is the live setting).
    [ -f "${file}" ] && return 0
    log "Configuring cog rotation (${file})..."
    mkdir -p "$(dirname "${file}")"
    cat > "${file}" <<'COG_ROTATION_EOF'
# Calvin cog rotation (0=normal, 1=left/90 CCW, 2=inverted, 3=right/270).
# Written by calvin-cog-panel.sh from the Kiosks display setting; a re-run of the
# installer keeps an existing value.
CALVIN_COG_ROTATION=0
COG_ROTATION_EOF
    chmod 0644 "${file}"
}

# Warn (do not fail) when an opt-in stack is requested on a release this phase
# has not been validated on: Bookworm ships older labwc/no wlopm, and its cog/
# WPE packaging is older than Trixie's.
warn_unvalidated_display_os() {
    local stack="${1:-x11}" codename=""
    case "${stack}" in
        wayland|cog) ;;
        *) return 0 ;;
    esac
    # Read, don't source: sourcing /etc/os-release inside a command substitution
    # makes shellcheck think VERSION_CODENAME changes in a subshell in setup.sh.
    codename="$(grep -m1 '^VERSION_CODENAME=' /etc/os-release 2>/dev/null \
        | cut -d= -f2- | tr -d '\"' || true)"
    case "${codename}" in
        ""|trixie) return 0 ;;
    esac
    if [ "${stack}" = "wayland" ]; then
        log_warn "Wayland is validated on Trixie only (this is ${codename}); labwc/wlopm behave differently on older releases"
    else
        log_warn "cog is validated on Trixie only (this is ${codename}); older WPE/cog packaging behaves differently"
    fi
}

# Enable exactly one display owner and leave the others installed-but-disabled,
# so switching stacks is one re-run of the installer in either direction. On the
# cog stack Chromium (calvin-kiosk-remote.service) must stay off: there is no X
# or Wayland session for it, and it would fight cog for the panel.
enable_display_stack_units() {
    local stack="$1"
    local want drop kiosk="calvin-kiosk-remote.service"
    case "${stack}" in
        wayland)
            want="calvin-wayland.service"
            drop="calvin-x.service calvin-cog.service"
            ;;
        cog)
            want="calvin-cog.service"
            drop="calvin-x.service calvin-wayland.service"
            ;;
        *)
            want="calvin-x.service"
            drop="calvin-wayland.service calvin-cog.service"
            ;;
    esac

    if ! command -v systemctl >/dev/null 2>&1; then
        log_warn "systemctl not found; enable ${want} / disable ${drop} by hand"
        return 0
    fi

    log "Display stack ${stack}: enabling ${want}, disabling ${drop}"
    local unit
    for unit in ${drop}; do
        systemctl disable "${unit}" >/dev/null 2>&1 || true
    done
    systemctl enable "${want}" || error_exit "Failed to enable ${want}" 1
    if [ "${stack}" = "cog" ]; then
        systemctl disable "${kiosk}" >/dev/null 2>&1 || true
    else
        systemctl enable "${kiosk}" || error_exit "Failed to enable ${kiosk}" 1
    fi
    # The old compositor still owns tty1 until the next boot; install-kiosk.sh
    # reboots, and the switch is only complete once exactly one is enabled.
    log "Reboot to start ${want}"
}

# Apply the stack everywhere setup owns it: session env, compositor autostart,
# and which display unit is enabled. Safe to run repeatedly in either direction
# (switching a kiosk X11 <-> Wayland <-> cog in place).
apply_display_stack() {
    local stack="$1"
    local user="${2:-$DEFAULT_CALVIN_USER}"

    configure_display_session "${stack}" "${user}"
    case "${stack}" in
        wayland)
            warn_unvalidated_display_os "${stack}"
            configure_labwc_autostart "${user}"
            ;;
        cog)
            warn_unvalidated_display_os "${stack}"
            configure_cog_rotation
            ;;
    esac
    enable_display_stack_units "${stack}"
}

# Verification functions
verify_setup() {
    local calvin_dir="${1:-$DEFAULT_CALVIN_DIR}"
    local user="${2:-$DEFAULT_CALVIN_USER}"
    
    log "Verifying setup..."
    
    # Verify user exists
    if ! id "${user}" &>/dev/null; then
        error_exit "User ${user} does not exist" 1
    fi
    
    # Verify directory structure
    verify_directory "${calvin_dir}"
    verify_directory "${calvin_dir}/backend"
    verify_directory "${calvin_dir}/frontend"
    verify_directory "${calvin_dir}/backend/data/db"
    verify_directory "${calvin_dir}/backend/logs"
    
    # Verify backend dependencies (check for UV or venv)
    if [ -d "${calvin_dir}/backend/.venv" ] || sudo -u "${user}" bash -c "cd '${calvin_dir}/backend' && export PATH=\"/home/${user}/.local/bin:/home/${user}/.cargo/bin:\$PATH\" && command -v uv &> /dev/null"; then
        log "Backend dependencies verified"
    else
        log_warn "Backend dependencies may not be properly installed"
    fi
    
    # Verify frontend dependencies
    if [ -d "${calvin_dir}/frontend/node_modules" ]; then
        log "Frontend dependencies verified"
    else
        log_warn "Frontend dependencies may not be properly installed"
    fi
    
    log "Setup verification complete"
}
# Write the kiosk manifest signing key to a root-only 0600 file (calvin-5vw). No-op if empty.
install_signing_key() {
    local key="$1"
    local file="${CALVIN_KIOSK_SIGNING_ENV_FILE:-/etc/default/calvin-kiosk-signing}"
    [ -n "$key" ] || return 0
    install -m 0600 /dev/null "$file"
    printf 'CALVIN_KIOSK_SIGNING_KEY=%s\n' "$key" > "$file"
}

# Fetch the updater from the local backend, verify it against the manifest, and
# run it in --bootstrap mode to install the whole bundle (agent, units, updater,
# version, receipt). The updater is the single authoritative install path.
bootstrap_kiosk() {
    local backend_url="${1%/}"
    local sig_file="${CALVIN_KIOSK_SIGNING_ENV_FILE:-/etc/default/calvin-kiosk-signing}"
    local key="" manifest sha tmp got
    [ -f "$sig_file" ] && key="$(grep '^CALVIN_KIOSK_SIGNING_KEY=' "$sig_file" | cut -d= -f2- || true)"
    manifest="$(curl -fsSL "${backend_url}/api/kiosks/agent/manifest")" \
        || error_exit "Failed to fetch kiosk bundle manifest from ${backend_url}" 1
    if [ -n "$key" ]; then
        # Pass the manifest via env var, NOT a pipe: a heredoc (`<<'PY'`) claims python's
        # stdin, so a `printf ... | python - <<'PY'` pipe is silently discarded.
        MANIFEST_JSON="$manifest" CALVIN_KIOSK_SIGNING_KEY="$key" python3 - <<'PY' \
            || error_exit "kiosk manifest signature verification failed" 1
import json, hmac, hashlib, os
m = json.loads(os.environ["MANIFEST_JSON"])
key = os.environ["CALVIN_KIOSK_SIGNING_KEY"]
sig = m.pop("signature", None)
alg = m.pop("sig_alg", None)
if sig is None or alg is None or alg != "hmac-sha256":
    raise SystemExit(1)
canon = json.dumps(m, sort_keys=True, separators=(",", ":")).encode()
raise SystemExit(0 if hmac.compare_digest(
    hmac.new(bytes.fromhex(key), canon, hashlib.sha256).hexdigest(), str(sig)) else 1)
PY
    fi
    sha="$(printf '%s' "$manifest" | python3 -c 'import sys, json
m = json.load(sys.stdin)
print(next((f["sha256"] for f in m["files"] if f["name"] == "update-kiosk.sh"), ""))')"
    [ -n "$sha" ] || error_exit "manifest has no update-kiosk.sh entry" 1
    tmp="$(mktemp)"
    curl -fsSL "${backend_url}/api/kiosks/agent/files/update-kiosk.sh" -o "$tmp" \
        || error_exit "Failed to fetch update-kiosk.sh" 1
    got="$(sha256sum "$tmp" | cut -d' ' -f1)"
    [ "$got" = "$sha" ] || error_exit "update-kiosk.sh failed checksum verification" 1
    chmod +x "$tmp"
    CALVIN_BACKEND_URL="$backend_url" bash "$tmp" --bootstrap \
        || error_exit "kiosk bootstrap (update-kiosk.sh --bootstrap) failed" 1
    rm -f "$tmp"
}
# Workflow trigger
