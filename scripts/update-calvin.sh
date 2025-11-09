#!/bin/bash
# Auto-update script for Calvin Dashboard
# Pulls latest code from GitHub and restarts services

# Don't use set -e - we want to continue even if some steps fail
set +e

# Source environment file if it exists
if [ -f /etc/default/calvin-update ]; then
    . /etc/default/calvin-update
fi

REPO_DIR="${REPO_DIR:-/home/calvin/calvin}"
GIT_REPO="${GIT_REPO:-https://github.com/osterbergsimon/calvin.git}"
GIT_BRANCH="${GIT_BRANCH:-main}"

# Use user-writable log location
LOG_FILE="${REPO_DIR}/backend/logs/calvin-update.log"
mkdir -p "$(dirname "$LOG_FILE")"

# Ensure PATH includes UV
export PATH="/home/calvin/.local/bin:$PATH"

# Ensure we can write to the log file
touch "$LOG_FILE" 2>/dev/null || {
    # Fallback to home directory if logs directory not writable
    LOG_FILE="${HOME}/calvin-update.log"
    touch "$LOG_FILE" 2>/dev/null || {
        # Last resort: use /tmp
        LOG_FILE="/tmp/calvin-update.log"
    }
}

cd "$REPO_DIR" || {
    echo "[$(date)] ERROR: Cannot cd to $REPO_DIR" | tee -a "$LOG_FILE"
    exit 1
}

echo "[$(date)] Starting Calvin update..." | tee -a "$LOG_FILE"

# Check if git repo exists
if [ ! -d ".git" ]; then
    echo "Not a git repository. Cloning..." | tee -a "$LOG_FILE"
    git clone "$GIT_REPO" "$REPO_DIR"
    cd "$REPO_DIR"
    git checkout "$GIT_BRANCH"
else
    # Pull latest code
    echo "Pulling latest code from $GIT_BRANCH..." | tee -a "$LOG_FILE"
    if ! git fetch origin; then
        echo "Warning: Failed to fetch from origin" | tee -a "$LOG_FILE"
        exit 0  # Don't fail the service, just skip this update
    fi
    if ! git reset --hard "origin/$GIT_BRANCH"; then
        echo "Warning: Failed to reset to $GIT_BRANCH" | tee -a "$LOG_FILE"
        exit 0  # Don't fail the service, just skip this update
    fi
fi

# Update the update script itself if it exists in the repo
if [ -f "$REPO_DIR/scripts/update-calvin.sh" ] && [ -f "/usr/local/bin/update-calvin.sh" ]; then
    echo "Updating update script..." | tee -a "$LOG_FILE"
    cp "$REPO_DIR/scripts/update-calvin.sh" /usr/local/bin/update-calvin.sh
    chmod +x /usr/local/bin/update-calvin.sh
    chown calvin:calvin /usr/local/bin/update-calvin.sh 2>/dev/null || true
fi

# Update backend dependencies
echo "Updating backend dependencies..." | tee -a "$LOG_FILE"
cd "$REPO_DIR/backend" || {
    echo "ERROR: Cannot cd to backend directory" | tee -a "$LOG_FILE"
    exit 1
}

# Use venv if it exists (pip installation), otherwise use UV
if [ -f .venv/bin/activate ]; then
    source .venv/bin/activate
    pip install --upgrade pip
    # Install from pyproject.toml with linux and dev extras
    pip install .[linux,dev] 2>&1 | tee -a "$LOG_FILE"
else
    export PATH="/home/calvin/.local/bin:/home/calvin/.cargo/bin:$PATH"
    if ! uv sync --extra dev --extra linux 2>&1 | tee -a "$LOG_FILE"; then
        echo "Warning: Failed to update backend dependencies with UV" | tee -a "$LOG_FILE"
        # Try with pip as fallback
        echo "Trying pip as fallback..." | tee -a "$LOG_FILE"
        python3 -m venv .venv
        source .venv/bin/activate
        pip install --upgrade pip
        # Install from pyproject.toml with linux and dev extras
        pip install .[linux,dev] 2>&1 | tee -a "$LOG_FILE"
    fi
fi

# Update frontend dependencies
echo "Updating frontend dependencies..." | tee -a "$LOG_FILE"
cd "$REPO_DIR/frontend"
if ! npm ci; then
    echo "Warning: Failed to update frontend dependencies" | tee -a "$LOG_FILE"
    exit 0  # Don't fail the service
fi

# Rebuild frontend
echo "Rebuilding frontend..." | tee -a "$LOG_FILE"
if ! npm run build 2>&1 | tee -a "$LOG_FILE"; then
    echo "Warning: Failed to build frontend" | tee -a "$LOG_FILE"
    exit 0  # Don't fail the service
fi
echo "Frontend build completed successfully" | tee -a "$LOG_FILE"

# Restart services via systemd (non-blocking)
# Use sudo if available, otherwise try without (might fail if not running as root)
if systemctl is-active --quiet calvin-backend.service 2>/dev/null || sudo systemctl is-active --quiet calvin-backend.service 2>/dev/null; then
    echo "Restarting services via systemd..." | tee -a "$LOG_FILE"
    if sudo systemctl restart calvin-backend 2>/dev/null; then
        echo "Backend service restarted successfully" | tee -a "$LOG_FILE"
    elif systemctl --user restart calvin-backend 2>/dev/null; then
        echo "Backend service restarted successfully (user service)" | tee -a "$LOG_FILE"
    else
        echo "Warning: Failed to restart backend (may need sudo permissions)" | tee -a "$LOG_FILE"
        echo "Please restart manually: sudo systemctl restart calvin-backend" | tee -a "$LOG_FILE"
    fi
    # Frontend doesn't need restart (Chromium will reload)
    # But we can restart it if needed
    # systemctl restart calvin-frontend || true
else
    echo "Services not running. Please start them manually." | tee -a "$LOG_FILE"
fi

echo "[$(date)] Update complete!" | tee -a "$LOG_FILE"

