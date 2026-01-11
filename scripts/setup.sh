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

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source shared utilities
# If running from wget/curl, setup-common.sh should be in the same directory
if [ -f "${SCRIPT_DIR}/setup-common.sh" ]; then
    source "${SCRIPT_DIR}/setup-common.sh"
else
    # Fallback: try to source from current directory if script is in PATH
    if [ -f "./setup-common.sh" ]; then
        source "./setup-common.sh"
    else
        echo "Error: setup-common.sh not found. Please ensure it's in the same directory as setup.sh" >&2
        exit 1
    fi
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
    
    # Step 5: Install Node.js
    ensure_nodejs_installed 20
    
    # Step 6: Setup Git repository
    ensure_git_repo "${GIT_REPO}" "${GIT_BRANCH}" "${CALVIN_DIR}" "${CALVIN_USER}"
    
    # Step 7: Install backend dependencies (production with linux extra for evdev)
    install_backend_deps "${CALVIN_DIR}" "${CALVIN_USER}" "linux" false
    
    # Step 8: Install frontend dependencies (production)
    install_frontend_deps "${CALVIN_DIR}" "${CALVIN_USER}" true
    
    # Step 9: Build frontend
    build_frontend "${CALVIN_DIR}" "${CALVIN_USER}"
    
    # Step 10: Create data directories
    create_data_directories "${CALVIN_DIR}" "${CALVIN_USER}"
    
    # Step 11: Install utility scripts
    install_script "${CALVIN_DIR}/scripts/update-calvin.sh" "/usr/local/bin/update-calvin.sh" "${CALVIN_USER}"
    
    if [ -f "${CALVIN_DIR}/scripts/reboot-calvin.sh" ]; then
        install_script "${CALVIN_DIR}/scripts/reboot-calvin.sh" "/usr/local/bin/reboot-calvin.sh" "${CALVIN_USER}"
        # Configure sudoers for reboot script
        log "Configuring sudoers for reboot script..."
        echo "${CALVIN_USER} ALL=(ALL) NOPASSWD: /usr/local/bin/reboot-calvin.sh" > /etc/sudoers.d/calvin-reboot
        chmod 0440 /etc/sudoers.d/calvin-reboot
    fi
    
    # Step 12: Configure polkit
    configure_polkit_reboot "${CALVIN_USER}"
    
    # Step 13: Create update configuration
    create_update_config "${GIT_REPO}" "${GIT_BRANCH}" "${CALVIN_DIR}"
    
    # Step 14: Install systemd services
    log "Installing systemd services..."
    install_systemd_service "${CALVIN_DIR}/rpi-image/systemd/calvin-backend.service" "${CALVIN_DIR}"
    install_systemd_service "${CALVIN_DIR}/rpi-image/systemd/calvin-frontend.service" "${CALVIN_DIR}"
    
    # Step 15: Enable and start services
    enable_systemd_service "calvin-backend.service"
    enable_systemd_service "calvin-frontend.service"
    
    log "Starting services..."
    start_systemd_service "calvin-backend.service"
    sleep 5  # Wait for backend to start
    start_systemd_service "calvin-frontend.service"
    
    # Step 16: Configure display
    configure_display "${CALVIN_USER}"
    
    # Step 17: Configure Openbox autostart (production mode - port 8000)
    configure_openbox_autostart "${CALVIN_USER}" "http://localhost:8000"
    
    # Step 18: Verify setup
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
