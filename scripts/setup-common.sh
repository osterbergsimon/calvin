#!/bin/bash
# Shared utilities for Calvin setup scripts
# This script provides common functions used by setup.sh and setup-dev.sh
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
readonly DEFAULT_GIT_BRANCH="main"
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
update_system_packages() {
    log "Updating system packages..."
    apt-get update -qq || error_exit "Failed to update package list" 1
    apt-get upgrade -y -qq || log_warn "Some packages failed to upgrade (non-fatal)"
}

install_system_packages() {
    local packages=("$@")
    log "Installing system packages: ${packages[*]}"
    apt-get install -y -qq "${packages[@]}" || log_warn "Some packages may have failed to install (non-fatal)"
}

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
    sudo -u "${user}" bash << 'UV_INSTALL_EOF'
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
    
    if [ $? -ne 0 ] || ! sudo -u "${user}" bash -c 'export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH" && uv --version &> /dev/null'; then
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
    curl -fsSL https://deb.nodesource.com/setup_${min_version}.x | bash - || error_exit "Failed to setup Node.js repository" 1
    apt-get install -y -qq nodejs || error_exit "Failed to install Node.js" 1
    
    if ! command -v node &> /dev/null; then
        error_exit "Node.js installation verification failed" 1
    fi
    
    log "Node.js $(node --version) installed successfully"
}

# Git repository management
ensure_git_repo() {
    local repo_url="${1:-$DEFAULT_GIT_REPO}"
    local branch="${2:-$DEFAULT_GIT_BRANCH}"
    local target_dir="${3:-$DEFAULT_CALVIN_DIR}"
    local user="${4:-$DEFAULT_CALVIN_USER}"
    
    log "Setting up Git repository: ${repo_url} (branch: ${branch})"
    
    if [ ! -d "${target_dir}" ]; then
        log "Cloning repository to ${target_dir}..."
        sudo -u "${user}" git clone "${repo_url}" "${target_dir}" || error_exit "Failed to clone repository" 1
        cd "${target_dir}"
        sudo -u "${user}" git checkout "${branch}" || error_exit "Failed to checkout branch ${branch}" 1
    else
        log "Repository directory exists, updating..."
        cd "${target_dir}"
        sudo -u "${user}" git fetch origin || error_exit "Failed to fetch from origin" 1
        sudo -u "${user}" git reset --hard "origin/${branch}" || error_exit "Failed to reset to origin/${branch}" 1
    fi
    
    # Verify we're on the correct branch
    local current_branch
    current_branch=$(sudo -u "${user}" git rev-parse --abbrev-ref HEAD)
    if [ "${current_branch}" != "${branch}" ]; then
        log_warn "Current branch is ${current_branch}, expected ${branch}"
    fi
    
    log "Repository setup complete"
}

# Backend dependency installation
install_backend_deps() {
    local calvin_dir="${1:-$DEFAULT_CALVIN_DIR}"
    local user="${2:-$DEFAULT_CALVIN_USER}"
    local extras="${3:-linux}"  # Default to linux extra (for evdev)
    local use_venv="${4:-false}"  # Use venv instead of UV (for dev on Pi 3B+)
    
    log "Installing backend dependencies (extras: ${extras})..."
    cd "${calvin_dir}/backend"
    chown -R "${user}:${user}" "${calvin_dir}"
    
    if [ "${use_venv}" = "true" ]; then
        log "Using venv for backend installation (development mode)..."
        sudo -u "${user}" bash << BACKEND_INSTALL_VENV_EOF
            cd ${calvin_dir}/backend
            if [ ! -d .venv ]; then
                python3 -m venv .venv
            fi
            source .venv/bin/activate
            pip install --upgrade pip
            pip install .[${extras}]
BACKEND_INSTALL_VENV_EOF
    else
        log "Using UV for backend installation..."
        sudo -u "${user}" bash << BACKEND_INSTALL_UV_EOF
            export PATH="/home/${user}/.local/bin:/home/${user}/.cargo/bin:\$PATH"
            cd ${calvin_dir}/backend
            # Convert comma-separated extras to multiple --extra flags for UV
            UV_EXTRAS=""
            IFS=',' read -ra EXTRA_ARRAY <<< "${extras}"
            for extra in "\${EXTRA_ARRAY[@]}"; do
                UV_EXTRAS="\${UV_EXTRAS} --extra \${extra}"
            done
            if [ -f uv.lock ]; then
                uv sync --frozen \${UV_EXTRAS} || uv sync \${UV_EXTRAS}
            else
                uv sync \${UV_EXTRAS}
            fi
BACKEND_INSTALL_UV_EOF
    fi
    
    if [ $? -ne 0 ]; then
        error_exit "Backend dependency installation failed" 1
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
    
    # Extract to frontend/dist/
    log "Extracting pre-built frontend..."
    sudo -u "${user}" bash -c "cd '${calvin_dir}/frontend' && mkdir -p dist && tar -xzf '${temp_file}' -C ." || {
        rm -rf "${temp_dir}"
        log_warn "Failed to extract pre-built frontend"
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
    log "Installing systemd service: ${service_name}"
    
    cp "${service_file}" "/etc/systemd/system/" || error_exit "Failed to copy service file" 1
    systemctl daemon-reload || error_exit "Failed to reload systemd daemon" 1
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
install_script() {
    local script_path="${1}"
    local target_path="${2}"
    local user="${3:-$DEFAULT_CALVIN_USER}"
    
    if [ ! -f "${script_path}" ]; then
        log_warn "Script file does not exist: ${script_path}, skipping installation"
        return 0
    fi
    
    log "Installing script: $(basename "${script_path}")"
    cp "${script_path}" "${target_path}" || error_exit "Failed to copy script" 1
    chmod +x "${target_path}" || error_exit "Failed to make script executable" 1
    chown "${user}:${user}" "${target_path}" || error_exit "Failed to set script ownership" 1
    log "Script installed: ${target_path}"
}

# Configuration file creation
create_update_config() {
    local git_repo="${1:-$DEFAULT_GIT_REPO}"
    local git_branch="${2:-$DEFAULT_GIT_BRANCH}"
    local repo_dir="${3:-$DEFAULT_CALVIN_DIR}"
    
    log "Creating update configuration..."
    cat > /etc/default/calvin-update << EOF
GIT_REPO=${git_repo}
GIT_BRANCH=${git_branch}
REPO_DIR=${repo_dir}
EOF
    log "Update configuration saved to /etc/default/calvin-update"
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
        desired_size_gb=$(echo "${swap_size}" | sed 's/G//')
        
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
    desired_size_gb=$(echo "${swap_size}" | sed 's/G//')
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
    
    log "Configuring polkit for reboot..."
    mkdir -p /etc/polkit-1/rules.d
    cat > /etc/polkit-1/rules.d/50-calvin-reboot.rules << POLKIT_EOF
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
    chmod 644 /etc/polkit-1/rules.d/50-calvin-reboot.rules
    log "Polkit reboot rules configured"
}

# Display configuration
configure_display() {
    local user="${1:-$DEFAULT_CALVIN_USER}"
    local user_home="/home/${user}"
    
    log "Configuring display settings..."
    
    # .xprofile
    cat > "${user_home}/.xprofile" << 'XPROFILE_EOF'
#!/bin/bash
xset s off
xset -dpms
xset s noblank
XPROFILE_EOF
    chmod +x "${user_home}/.xprofile"
    chown "${user}:${user}" "${user_home}/.xprofile"
    
    # .xinitrc
    cat > "${user_home}/.xinitrc" << 'EOF'
#!/bin/sh
exec openbox-session
EOF
    chmod +x "${user_home}/.xinitrc"
    chown "${user}:${user}" "${user_home}/.xinitrc"
    
    # Auto-login
    mkdir -p /etc/systemd/system/getty@tty1.service.d
    cat > /etc/systemd/system/getty@tty1.service.d/autologin.conf << EOF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin ${user} --noclear %I \$TERM
EOF
    
    # .bash_profile (auto-start X)
    cat > "${user_home}/.bash_profile" << 'EOF'
if [ -z "$DISPLAY" ] && [ -n "$XDG_VTNR" ] && [ "$XDG_VTNR" -eq 1 ]; then
    exec startx
fi
EOF
    chown "${user}:${user}" "${user_home}/.bash_profile"
    
    log "Display configuration complete"
}

# Openbox autostart configuration
configure_openbox_autostart() {
    local user="${1:-$DEFAULT_CALVIN_USER}"
    local user_home="/home/${user}"
    local frontend_url="${2:-http://localhost:8000}"  # Default to production
    
    log "Configuring Openbox autostart..."
    mkdir -p "${user_home}/.config/openbox"
    
    # Build autostart script
    {
        echo "#!/bin/bash"
        echo "# Wait for backend to be ready"
        echo "while ! curl -s http://localhost:8000/api/health > /dev/null; do"
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
        echo "# Hide cursor after 3 seconds"
        echo "unclutter -idle 3 -root &"
    } > "${user_home}/.config/openbox/autostart"
    
    chmod +x "${user_home}/.config/openbox/autostart"
    chown -R "${user}:${user}" "${user_home}/.config"
    
    log "Openbox autostart configured"
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
# Workflow trigger

