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

LOG_FILE="/var/log/calvin-update.log"

# Ensure PATH includes UV
export PATH="/home/calvin/.local/bin:$PATH"

cd "$REPO_DIR"

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

# Update backend dependencies
echo "Updating backend dependencies..." | tee -a "$LOG_FILE"
cd "$REPO_DIR/backend"
# Use venv if it exists (pip installation), otherwise use UV
if [ -f .venv/bin/activate ]; then
    source .venv/bin/activate
    pip install --upgrade pip
    pip install -r <(python -c "import tomli; import tomllib; f=open('pyproject.toml','rb'); d=tomllib.load(f); [print(f'{p}{v}') for p,v in d['project']['dependencies']]") 2>/dev/null || pip install fastapi uvicorn[standard] python-dotenv google-api-python-client google-auth-httplib2 google-auth-oauthlib APScheduler Pillow aiofiles sqlalchemy aiosqlite pydantic pydantic-settings websockets icalendar httpx evdev pytest pytest-asyncio pytest-cov pytest-mock faker factory-boy ruff mypy bandit pre-commit
else
    export PATH="/home/calvin/.local/bin:/home/calvin/.cargo/bin:$PATH"
    if ! uv sync --extra dev --extra linux; then
        echo "Warning: Failed to update backend dependencies with UV" | tee -a "$LOG_FILE"
        # Try with pip as fallback
        if [ -f .venv/bin/activate ]; then
            source .venv/bin/activate
            pip install -r requirements.txt 2>/dev/null || echo "Warning: pip install also failed" | tee -a "$LOG_FILE"
        fi
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
if ! npm run build; then
    echo "Warning: Failed to build frontend" | tee -a "$LOG_FILE"
    exit 0  # Don't fail the service
fi

# Restart services via systemd (non-blocking)
if systemctl is-active --quiet calvin-backend.service; then
    echo "Restarting services via systemd..." | tee -a "$LOG_FILE"
    systemctl restart calvin-backend || echo "Warning: Failed to restart backend" | tee -a "$LOG_FILE"
    # Frontend doesn't need restart (Chromium will reload)
    # But we can restart it if needed
    # systemctl restart calvin-frontend || true
else
    echo "Services not running. Please start them manually." | tee -a "$LOG_FILE"
fi

echo "[$(date)] Update complete!" | tee -a "$LOG_FILE"

