#!/bin/bash
# Calvin Dashboard - Development Setup Script
# This script can be run via: wget -O- https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup-dev.sh | sudo bash
# Or: curl -fsSL https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup-dev.sh | sudo bash
#
# To use a different branch, set GIT_BRANCH environment variable:
#   export GIT_BRANCH=develop
#   wget -O- https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup-dev.sh | sudo -E bash
#   # Or with curl:
#   curl -fsSL https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup-dev.sh | sudo -E bash
#
# Note: Use 'sudo -E' to preserve environment variables. Without -E, sudo will not
# pass GIT_BRANCH or GIT_REPO to the script.
# IMPORTANT: Export the variable first (export GIT_BRANCH=develop) rather than
# setting it inline (GIT_BRANCH=develop wget ...), as inline assignments don't
# propagate through pipes to sudo.
#
# To use a different repository:
#   export GIT_REPO=https://github.com/yourusername/calvin.git
#   export GIT_BRANCH=develop
#   wget -O- ... | sudo -E bash

set -euo pipefail

# Read GIT_BRANCH and GIT_REPO from environment early (before any defaults)
# This ensures they're preserved when the script is piped through sudo
# Also check /etc/default/calvin-update as fallback (for reinstall scenarios)
# Environment variables take precedence over config file
_ENV_GIT_BRANCH="${GIT_BRANCH:-}"
_ENV_GIT_REPO="${GIT_REPO:-}"

# If environment variables are not set, check /etc/default/calvin-update
if [ -z "${_ENV_GIT_BRANCH}" ] && [ -f /etc/default/calvin-update ]; then
    # Source the config file in a subshell to avoid polluting environment
    # Extract just the values we need
    _CONFIG_BRANCH=$(grep "^GIT_BRANCH=" /etc/default/calvin-update 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" || echo "")
    _CONFIG_REPO=$(grep "^GIT_REPO=" /etc/default/calvin-update 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" || echo "")
    if [ -n "${_CONFIG_BRANCH}" ]; then
        _ENV_GIT_BRANCH="${_CONFIG_BRANCH}"
    fi
    if [ -n "${_CONFIG_REPO}" ]; then
        _ENV_GIT_REPO="${_CONFIG_REPO}"
    fi
fi

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
        echo "Error: setup-common.sh not found. Please ensure it's in the same directory as setup-dev.sh" >&2
        exit 1
    fi
fi

# Configuration (can be overridden by environment variables)
# Configuration (can be overridden by environment variables)
# Use the environment variable if it was set at the start, otherwise use defaults
GIT_REPO="${_ENV_GIT_REPO:-${GIT_REPO:-$DEFAULT_GIT_REPO}}"
GIT_BRANCH="${_ENV_GIT_BRANCH:-${GIT_BRANCH:-$DEFAULT_GIT_BRANCH}}"
CALVIN_DIR="${CALVIN_DIR:-$DEFAULT_CALVIN_DIR}"
CALVIN_USER="${CALVIN_USER:-$DEFAULT_CALVIN_USER}"
LOG_FILE="${LOG_FILE:-$DEFAULT_LOG_FILE}"

# Create dev-specific frontend service
create_dev_frontend_service() {
    local calvin_dir="${1:-$DEFAULT_CALVIN_DIR}"
    
    log "Creating development frontend service..."
    cat > /etc/systemd/system/calvin-frontend-dev.service << 'EOF'
[Unit]
Description=Calvin Dashboard Frontend (Development - Hot Reload)
After=network.target calvin-backend.service
Requires=calvin-backend.service

[Service]
Type=simple
User=calvin
WorkingDirectory=/home/calvin/calvin/frontend
Environment="PATH=/usr/local/bin:/usr/bin:/bin:/home/calvin/.local/bin"
Environment="NODE_ENV=development"
ExecStart=/usr/bin/npm run dev
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
    log "Development frontend service created"
}

# Update xprofile for dev mode (start frontend dev service when X is ready)
update_xprofile_for_dev() {
    local user="${1:-$DEFAULT_CALVIN_USER}"
    local user_home="/home/${user}"
    
    log "Updating .xprofile for development mode..."
    cat > "${user_home}/.xprofile" << 'XPROFILE_EOF'
#!/bin/bash
xset s off
xset -dpms
xset s noblank

# Start frontend dev service when X is ready
sleep 2
if ! systemctl is-active --quiet calvin-frontend-dev.service; then
    systemctl start calvin-frontend-dev.service 2>/dev/null || true
fi
XPROFILE_EOF
    chmod +x "${user_home}/.xprofile"
    chown "${user}:${user}" "${user_home}/.xprofile"
}

# Main setup function
main() {
    log "=========================================="
    log "Calvin Development Setup"
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
    
    # Step 3: Setup swap file (for Pi 3B+ with only 1GB RAM)
    log "Setting up swap file for development..."
    setup_swap_file "4G"
    
    # Step 4: Install system dependencies
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
    
    # Step 5: Install UV (will be used as fallback, but we prefer venv for dev on Pi 3B+)
    ensure_uv_installed "${CALVIN_USER}"
    
    # Step 6: Install Node.js
    ensure_nodejs_installed 20
    
    # Step 7: Setup Git repository
    ensure_git_repo "${GIT_REPO}" "${GIT_BRANCH}" "${CALVIN_DIR}" "${CALVIN_USER}"
    
    # Step 8: Install backend dependencies (dev mode with linux extra, using venv for stability on Pi 3B+)
    install_backend_deps "${CALVIN_DIR}" "${CALVIN_USER}" "linux,dev" true
    
    # Step 9: Install frontend dependencies (all dependencies for dev server)
    install_frontend_deps "${CALVIN_DIR}" "${CALVIN_USER}" false
    
    # Verify axios is installed (known issue with npm install on some systems)
    if [ ! -d "${CALVIN_DIR}/frontend/node_modules/axios" ]; then
        log_warn "axios not found in node_modules, installing explicitly..."
        sudo -u "${CALVIN_USER}" bash -c "cd '${CALVIN_DIR}/frontend' && npm install axios" || {
            log_warn "Failed to install axios, retrying with cache clean..."
            sudo -u "${CALVIN_USER}" bash -c "cd '${CALVIN_DIR}/frontend' && npm cache clean --force && npm install axios"
        }
    fi
    
    # Step 10: Create data directories
    create_data_directories "${CALVIN_DIR}" "${CALVIN_USER}"
    
    # Step 11: Create .dev marker file for hot reload
    log "Creating .dev marker file for hot reload..."
    touch "${CALVIN_DIR}/backend/.dev"
    chown "${CALVIN_USER}:${CALVIN_USER}" "${CALVIN_DIR}/backend/.dev"
    
    # Step 12: Install utility scripts
    install_script "${CALVIN_DIR}/scripts/update-calvin-dev.sh" "/usr/local/bin/update-calvin-dev.sh" "${CALVIN_USER}"
    # Create symlink for backward compatibility
    if [ -f "/usr/local/bin/update-calvin-dev.sh" ]; then
        ln -sf /usr/local/bin/update-calvin-dev.sh /usr/local/bin/update-calvin.sh
        chown -h "${CALVIN_USER}:${CALVIN_USER}" /usr/local/bin/update-calvin.sh 2>/dev/null || true
    fi
    
    if [ -f "${CALVIN_DIR}/scripts/reboot-calvin.sh" ]; then
        install_script "${CALVIN_DIR}/scripts/reboot-calvin.sh" "/usr/local/bin/reboot-calvin.sh" "${CALVIN_USER}"
        # Configure sudoers for reboot script
        log "Configuring sudoers for reboot script..."
        echo "${CALVIN_USER} ALL=(ALL) NOPASSWD: /usr/local/bin/reboot-calvin.sh" > /etc/sudoers.d/calvin-reboot
        chmod 0440 /etc/sudoers.d/calvin-reboot
    fi
    
    if [ -f "${CALVIN_DIR}/scripts/restart-calvin-services.sh" ]; then
        install_script "${CALVIN_DIR}/scripts/restart-calvin-services.sh" "/usr/local/bin/restart-calvin-services.sh" "${CALVIN_USER}"
        # Configure sudoers for restart script
        log "Configuring sudoers for restart script..."
        echo "${CALVIN_USER} ALL=(ALL) NOPASSWD: /usr/local/bin/restart-calvin-services.sh" > /etc/sudoers.d/calvin-restart
        chmod 0440 /etc/sudoers.d/calvin-restart
    fi
    
    # Step 13: Configure polkit
    configure_polkit_reboot "${CALVIN_USER}"
    
    # Step 14: Create update configuration
    create_update_config "${GIT_REPO}" "${GIT_BRANCH}" "${CALVIN_DIR}"
    
    # Step 15: Install systemd services
    log "Installing systemd services..."
    install_systemd_service "${CALVIN_DIR}/rpi-image/systemd/calvin-backend.service" "${CALVIN_DIR}"
    
    # Create and install dev-specific frontend service
    create_dev_frontend_service "${CALVIN_DIR}"
    # systemctl daemon-reload may fail in CI environments without systemd, but file is still created
    if ! systemctl daemon-reload 2>/dev/null; then
        log_warn "systemctl daemon-reload failed (non-fatal, may be running in CI environment without systemd)"
    fi
    
    # Disable production frontend service if it exists
    if systemctl list-unit-files | grep -q calvin-frontend.service; then
        systemctl stop calvin-frontend.service 2>/dev/null || true
        systemctl disable calvin-frontend.service 2>/dev/null || true
        log "Disabled production frontend service (using dev service instead)"
    fi
    
    # Disable problematic calvin-x.service if it exists
    if systemctl list-unit-files | grep -q calvin-x.service; then
        systemctl stop calvin-x.service 2>/dev/null || true
        systemctl disable calvin-x.service 2>/dev/null || true
        log "Disabled calvin-x.service (can cause boot loops)"
    fi
    
    # Step 16: Enable services
    enable_systemd_service "calvin-backend.service"
    enable_systemd_service "calvin-frontend-dev.service"
    
    # Step 17: Start backend service (frontend dev service will start when X is ready)
    log "Starting backend service..."
    start_systemd_service "calvin-backend.service"
    
    # Step 18: Configure display
    configure_display "${CALVIN_USER}"
    
    # Step 19: Update xprofile for dev mode
    update_xprofile_for_dev "${CALVIN_USER}"
    
    # Step 20: Configure Openbox autostart (dev mode - port 5173)
    configure_openbox_autostart "${CALVIN_USER}" "http://localhost:5173"
    
    # Step 21: Verify setup
    verify_setup "${CALVIN_DIR}" "${CALVIN_USER}"
    
    # Final summary
    log ""
    log "=========================================="
    log "Calvin Development Setup Complete!"
    log "=========================================="
    log "Repository: ${GIT_REPO}"
    log "Branch: ${GIT_BRANCH} (saved to /etc/default/calvin-update)"
    log "Installation Directory: ${CALVIN_DIR}"
    log "User: ${CALVIN_USER}"
    log ""
    log "Development Mode Features:"
    log "  - Backend runs with hot reload (uvicorn --reload)"
    log "  - Frontend runs with hot reload (vite dev server on port 5173)"
    log "  - .dev marker file created for backend hot reload detection"
    log ""
    log "IMPORTANT: Reboot to start X and the dashboard:"
    log "  sudo reboot"
    log ""
    log "After reboot:"
    log "  - X will start automatically on tty1"
    log "  - Backend service will start automatically (with hot reload)"
    log "  - Frontend dev server will start automatically (with hot reload)"
    log "  - Dashboard will be available at http://localhost:5173"
    log ""
    log "To update Calvin:"
    log "  git pull in ${CALVIN_DIR} (services will auto-reload)"
    log "  Or use: update-calvin.sh"
    log ""
}

# Run main function
main "$@"
