#!/bin/bash
# Auto-update script for Calvin Dashboard
# Pulls latest code from GitHub and restarts services

set -e

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
    git fetch origin || { echo "Failed to fetch from origin" | tee -a "$LOG_FILE"; exit 1; }
    git reset --hard "origin/$GIT_BRANCH" || { echo "Failed to reset to $GIT_BRANCH" | tee -a "$LOG_FILE"; exit 1; }
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
    uv sync --extra dev --extra linux || { echo "Failed to update backend dependencies" | tee -a "$LOG_FILE"; exit 1; }
fi

# Update frontend dependencies
echo "Updating frontend dependencies..." | tee -a "$LOG_FILE"
cd "$REPO_DIR/frontend"
npm ci || { echo "Failed to update frontend dependencies" | tee -a "$LOG_FILE"; exit 1; }

# Rebuild frontend
echo "Rebuilding frontend..." | tee -a "$LOG_FILE"
npm run build || { echo "Failed to build frontend" | tee -a "$LOG_FILE"; exit 1; }

# Restart services via systemd
if systemctl is-active --quiet calvin-backend.service; then
    echo "Restarting services via systemd..." | tee -a "$LOG_FILE"
    systemctl restart calvin-backend || { echo "Failed to restart backend" | tee -a "$LOG_FILE"; exit 1; }
    # Frontend doesn't need restart (Chromium will reload)
    # But we can restart it if needed
    # systemctl restart calvin-frontend || true
else
    echo "Services not running. Please start them manually." | tee -a "$LOG_FILE"
fi

echo "[$(date)] Update complete!" | tee -a "$LOG_FILE"

