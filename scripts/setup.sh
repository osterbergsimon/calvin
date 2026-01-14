#!/bin/bash
# Calvin Dashboard - Production Setup Script
# This script can be run via: wget -O- https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup.sh | sudo sh
# Or: curl -fsSL https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup.sh | sudo sh
#
# To use a different branch, set GIT_BRANCH environment variable:
#   GIT_BRANCH=develop wget -O- https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup.sh | sudo sh
#   GIT_BRANCH=develop curl -fsSL https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup.sh | sudo sh
#
# To use a different repository:
#   GIT_REPO=https://github.com/yourusername/calvin.git GIT_BRANCH=develop wget -O- ... | sudo sh

set -euo pipefail

# Try to find setup-common.sh locally first
# If not found, download it from GitHub (works when running from pipe or when file is missing)
COMMON_SCRIPT=""

# Check current directory first (most common case when running locally)
if [ -f "./setup-common.sh" ]; then
    COMMON_SCRIPT="./setup-common.sh"
fi

# If running with bash, also check script's directory (avoid BASH_SOURCE syntax in sh)
if [ -z "${COMMON_SCRIPT}" ] && [ -n "${BASH_VERSION:-}" ]; then
    # Use bash to safely get script directory without causing errors in sh
    _script_dir=$(bash -c 'if [ -n "${BASH_SOURCE[0]:-}" ] && [ "${BASH_SOURCE[0]}" != "-" ]; then cd "$(dirname "${BASH_SOURCE[0]}")" && pwd; fi' 2>/dev/null || echo "")
    if [ -n "${_script_dir}" ] && [ -f "${_script_dir}/setup-common.sh" ]; then
        COMMON_SCRIPT="${_script_dir}/setup-common.sh"
    fi
fi

# If we found setup-common.sh locally, source it (use . for POSIX compatibility)
if [ -n "${COMMON_SCRIPT}" ] && [ -f "${COMMON_SCRIPT}" ]; then
    . "${COMMON_SCRIPT}"
else
    # Not found locally - download from GitHub
    echo "Downloading setup-common.sh from GitHub..." >&2
    
    # Create temp directory for download
    TEMP_DIR="$(mktemp -d)"
    trap "rm -rf '${TEMP_DIR}'" EXIT 2>/dev/null || true
    
    # Determine GitHub URL from environment or defaults
    GIT_REPO="${GIT_REPO:-https://github.com/osterbergsimon/calvin.git}"
    GIT_BRANCH="${GIT_BRANCH:-main}"
    
    # Extract repo owner and name from git URL
    repo_owner=$(echo "${GIT_REPO}" | sed -E 's|.*github\.com[:/]([^/]+)/([^/]+)(\.git)?$|\1|')
    repo_name=$(echo "${GIT_REPO}" | sed -E 's|.*github\.com[:/]([^/]+)/([^/]+)(\.git)?$|\2|' | sed 's|\.git$||')
    
    if [ -z "${repo_owner}" ] || [ -z "${repo_name}" ]; then
        echo "Error: Could not extract repo owner/name from ${GIT_REPO}" >&2
        exit 1
    fi
    
    # Download setup-common.sh from raw.githubusercontent.com
    common_url="https://raw.githubusercontent.com/${repo_owner}/${repo_name}/${GIT_BRANCH}/scripts/setup-common.sh"
    if command -v curl &> /dev/null; then
        if ! curl -fsSL -o "${TEMP_DIR}/setup-common.sh" "${common_url}"; then
            echo "Error: Failed to download setup-common.sh from ${common_url}" >&2
            exit 1
        fi
    elif command -v wget &> /dev/null; then
        if ! wget -q -O "${TEMP_DIR}/setup-common.sh" "${common_url}"; then
            echo "Error: Failed to download setup-common.sh from ${common_url}" >&2
            exit 1
        fi
    else
        echo "Error: Neither curl nor wget is available. Please install one of them." >&2
        exit 1
    fi
    
    . "${TEMP_DIR}/setup-common.sh"
fi

# Configuration (can be overridden by environment variables)
GIT_REPO="${GIT_REPO:-$DEFAULT_GIT_REPO}"
GIT_BRANCH="${GIT_BRANCH:-$DEFAULT_GIT_BRANCH}"
CALVIN_DIR="${CALVIN_DIR:-$DEFAULT_CALVIN_DIR}"
CALVIN_USER="${CALVIN_USER:-$DEFAULT_CALVIN_USER}"
LOG_FILE="${LOG_FILE:-$DEFAULT_LOG_FILE}"

# Main setup function
main() {
    log "=========================================="
    log "Calvin Production Setup"
    log "=========================================="
    log "Repository: ${GIT_REPO}"
    log "Branch: ${GIT_BRANCH}"
    log "Target Directory: ${CALVIN_DIR}"
    log "User: ${CALVIN_USER}"
    log ""
    
    # Check prerequisites
    check_root
    
    # Create log directory
    mkdir -p "$(dirname "${LOG_FILE}")"
    
    # Step 1: Ensure user exists
    ensure_user_exists "${CALVIN_USER}"
    
    # Step 2: Update system packages
    update_system_packages
    
    # Step 3: Install system dependencies
    log "Installing system dependencies..."
    install_system_packages \
        python3 \
        python3-dev \
        python3-venv \
        python3-pip \
        build-essential \
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
    
    # Step 4: Install UV
    ensure_uv_installed "${CALVIN_USER}"
    
    # Step 5: Setup Git repository (needed before we can check for pre-built frontend)
    ensure_git_repo "${GIT_REPO}" "${GIT_BRANCH}" "${CALVIN_DIR}" "${CALVIN_USER}"
    
    # Step 6: Install backend dependencies (production with linux extra for evdev)
    install_backend_deps "${CALVIN_DIR}" "${CALVIN_USER}" "linux" false
    
    # Step 7: Try to download pre-built frontend, fallback to building
    local frontend_prebuilt=false
    if download_prebuilt_frontend "${CALVIN_DIR}" "${CALVIN_USER}" "${GIT_REPO}" "${GIT_BRANCH}"; then
        frontend_prebuilt=true
        log "Using pre-built frontend - skipping Node.js installation and build"
    else
        log_warn "Pre-built frontend not available (CI/CD may not have completed or build failed)"
        log_warn "Falling back to building on target machine (requires Node.js)"
        
        # Step 7a: Install Node.js (only needed if building)
        ensure_nodejs_installed 20
        
        # Step 7b: Install frontend dependencies (need all dependencies including dev for build)
        install_frontend_deps "${CALVIN_DIR}" "${CALVIN_USER}" false
        
        # Step 7c: Build frontend
        build_frontend "${CALVIN_DIR}" "${CALVIN_USER}"
    fi
    
    # Step 8: Create data directories
    create_data_directories "${CALVIN_DIR}" "${CALVIN_USER}"
    
    # Step 9: Install utility scripts
    install_script "${CALVIN_DIR}/scripts/update-calvin.sh" "/usr/local/bin/update-calvin.sh" "${CALVIN_USER}"
    
    if [ -f "${CALVIN_DIR}/scripts/reboot-calvin.sh" ]; then
        install_script "${CALVIN_DIR}/scripts/reboot-calvin.sh" "/usr/local/bin/reboot-calvin.sh" "${CALVIN_USER}"
        # Configure sudoers for reboot script
        log "Configuring sudoers for reboot script..."
        echo "${CALVIN_USER} ALL=(ALL) NOPASSWD: /usr/local/bin/reboot-calvin.sh" > /etc/sudoers.d/calvin-reboot
        chmod 0440 /etc/sudoers.d/calvin-reboot
    fi
    
    # Step 10: Configure polkit
    configure_polkit_reboot "${CALVIN_USER}"
    
    # Step 11: Create update configuration
    create_update_config "${GIT_REPO}" "${GIT_BRANCH}" "${CALVIN_DIR}"
    
    # Step 12: Install systemd services
    log "Installing systemd services..."
    install_systemd_service "${CALVIN_DIR}/rpi-image/systemd/calvin-backend.service" "${CALVIN_DIR}"
    install_systemd_service "${CALVIN_DIR}/rpi-image/systemd/calvin-frontend.service" "${CALVIN_DIR}"
    
    # Step 13: Enable and start services
    enable_systemd_service "calvin-backend.service"
    enable_systemd_service "calvin-frontend.service"
    
    log "Starting services..."
    start_systemd_service "calvin-backend.service"
    sleep 5  # Wait for backend to start
    start_systemd_service "calvin-frontend.service"
    
    # Step 14: Configure display
    configure_display "${CALVIN_USER}"
    
    # Step 15: Configure Openbox autostart (production mode - port 8000)
    # Don't start Chromium in autostart since systemd service handles it
    configure_openbox_autostart "${CALVIN_USER}" "http://localhost:8000" "false"
    
    # Step 16: Verify setup
    verify_setup "${CALVIN_DIR}" "${CALVIN_USER}"
    
    # Final summary
    log ""
    log "=========================================="
    log "Calvin Production Setup Complete!"
    log "=========================================="
    log "Repository: ${GIT_REPO}"
    log "Branch: ${GIT_BRANCH} (saved to /etc/default/calvin-update)"
    log "Installation Directory: ${CALVIN_DIR}"
    log "User: ${CALVIN_USER}"
    log ""
    log "IMPORTANT: Reboot to start X and the dashboard:"
    log "  sudo reboot"
    log ""
    log "After reboot:"
    log "  - X will start automatically on tty1"
    log "  - Backend service will start automatically"
    log "  - Frontend (kiosk mode) will start automatically"
    log "  - Dashboard will be available at http://localhost:8000"
    log ""
    log "To update Calvin in the future:"
    log "  update-calvin.sh"
    log ""
}

# Run main function
main "$@"
