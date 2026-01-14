#!/bin/bash
# Development update script for Calvin Dashboard
# Simple update: git pull + restart services
# Respects GIT_REPO and GIT_BRANCH from /etc/default/calvin-update or environment

set +e  # Don't exit on errors - we want to continue even if some steps fail

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

echo "[$(date)] Starting Calvin development update..." | tee -a "$LOG_FILE"
echo "Repository: $GIT_REPO" | tee -a "$LOG_FILE"
echo "Branch: $GIT_BRANCH" | tee -a "$LOG_FILE"

# Check if git repo exists
if [ ! -d ".git" ]; then
    echo "ERROR: Not a git repository. Cannot update." | tee -a "$LOG_FILE"
    exit 1
fi

# Check current commit before fetching
CURRENT_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "")

# Pull latest code
echo "Fetching latest code from $GIT_BRANCH..." | tee -a "$LOG_FILE"
if ! git fetch origin; then
    echo "ERROR: Failed to fetch from origin" | tee -a "$LOG_FILE"
    exit 1
fi

# Check if there are any changes
NEW_COMMIT=$(git rev-parse "origin/$GIT_BRANCH" 2>/dev/null || echo "")
if [ -z "$NEW_COMMIT" ]; then
    echo "ERROR: Failed to get commit hash for origin/$GIT_BRANCH" | tee -a "$LOG_FILE"
    exit 1
fi

if [ "$CURRENT_COMMIT" = "$NEW_COMMIT" ]; then
    echo "No changes detected. Already up to date at commit $CURRENT_COMMIT" | tee -a "$LOG_FILE"
    HAS_CHANGES=false
else
    echo "Changes detected. Updating from $CURRENT_COMMIT to $NEW_COMMIT..." | tee -a "$LOG_FILE"
    if ! git reset --hard "origin/$GIT_BRANCH"; then
        echo "ERROR: Failed to reset to $GIT_BRANCH" | tee -a "$LOG_FILE"
        exit 1
    fi
    echo "Code updated successfully" | tee -a "$LOG_FILE"
    HAS_CHANGES=true
fi

# Update the update script itself if there are changes
if [ "$HAS_CHANGES" = true ] && [ -f "/usr/local/bin/update-calvin-dev.sh" ]; then
    echo "Checking for update script updates..." | tee -a "$LOG_FILE"
    
    # Extract repo owner and name from git URL
    repo_owner=$(echo "${GIT_REPO}" | sed -E 's|.*github\.com[:/]([^/]+)/([^/]+)(\.git)?$|\1|')
    repo_name=$(echo "${GIT_REPO}" | sed -E 's|.*github\.com[:/]([^/]+)/([^/]+)(\.git)?$|\2|' | sed 's|\.git$||')
    
    if [ -n "${repo_owner}" ] && [ -n "${repo_name}" ]; then
        SCRIPT_URL="https://raw.githubusercontent.com/${repo_owner}/${repo_name}/${GIT_BRANCH}/scripts/update-calvin-dev.sh"
        TEMP_SCRIPT=$(mktemp)
        
        # Try to download updated script from GitHub
        if command -v curl &> /dev/null; then
            if curl -fsSL -o "$TEMP_SCRIPT" "$SCRIPT_URL"; then
                echo "Updating update script from GitHub..." | tee -a "$LOG_FILE"
                cp "$TEMP_SCRIPT" /usr/local/bin/update-calvin-dev.sh
                chmod +x /usr/local/bin/update-calvin-dev.sh
                chown calvin:calvin /usr/local/bin/update-calvin-dev.sh 2>/dev/null || true
                rm -f "$TEMP_SCRIPT"
            else
                # Fallback to local if GitHub download fails
                if [ -f "$REPO_DIR/scripts/update-calvin-dev.sh" ]; then
                    echo "Updating update script from local repo..." | tee -a "$LOG_FILE"
                    cp "$REPO_DIR/scripts/update-calvin-dev.sh" /usr/local/bin/update-calvin-dev.sh
                    chmod +x /usr/local/bin/update-calvin-dev.sh
                    chown calvin:calvin /usr/local/bin/update-calvin-dev.sh 2>/dev/null || true
                fi
                rm -f "$TEMP_SCRIPT"
            fi
        elif command -v wget &> /dev/null; then
            if wget -q -O "$TEMP_SCRIPT" "$SCRIPT_URL"; then
                echo "Updating update script from GitHub..." | tee -a "$LOG_FILE"
                cp "$TEMP_SCRIPT" /usr/local/bin/update-calvin-dev.sh
                chmod +x /usr/local/bin/update-calvin-dev.sh
                chown calvin:calvin /usr/local/bin/update-calvin-dev.sh 2>/dev/null || true
                rm -f "$TEMP_SCRIPT"
            else
                # Fallback to local if GitHub download fails
                if [ -f "$REPO_DIR/scripts/update-calvin-dev.sh" ]; then
                    echo "Updating update script from local repo..." | tee -a "$LOG_FILE"
                    cp "$REPO_DIR/scripts/update-calvin-dev.sh" /usr/local/bin/update-calvin-dev.sh
                    chmod +x /usr/local/bin/update-calvin-dev.sh
                    chown calvin:calvin /usr/local/bin/update-calvin-dev.sh 2>/dev/null || true
                fi
                rm -f "$TEMP_SCRIPT"
            fi
        elif [ -f "$REPO_DIR/scripts/update-calvin-dev.sh" ]; then
            # Fallback to local if no download tool available
            echo "Updating update script from local repo..." | tee -a "$LOG_FILE"
            cp "$REPO_DIR/scripts/update-calvin-dev.sh" /usr/local/bin/update-calvin-dev.sh
            chmod +x /usr/local/bin/update-calvin-dev.sh
            chown calvin:calvin /usr/local/bin/update-calvin-dev.sh 2>/dev/null || true
        fi
    fi
fi

# Restart services via systemd
# In dev mode, services have hot reload, but we restart to ensure clean state
if systemctl is-active --quiet calvin-backend.service 2>/dev/null || sudo systemctl is-active --quiet calvin-backend.service 2>/dev/null; then
    echo "Restarting backend service..." | tee -a "$LOG_FILE"
    if sudo systemctl restart calvin-backend 2>/dev/null; then
        echo "Backend service restarted successfully" | tee -a "$LOG_FILE"
    elif systemctl --user restart calvin-backend 2>/dev/null; then
        echo "Backend service restarted successfully (user service)" | tee -a "$LOG_FILE"
    else
        echo "Warning: Failed to restart backend (may need sudo permissions)" | tee -a "$LOG_FILE"
        echo "Note: Backend has hot reload, so manual restart may not be necessary" | tee -a "$LOG_FILE"
    fi
    
    # Frontend dev service also has hot reload, but restart for consistency
    if systemctl is-active --quiet calvin-frontend-dev.service 2>/dev/null || sudo systemctl is-active --quiet calvin-frontend-dev.service 2>/dev/null; then
        echo "Restarting frontend dev service..." | tee -a "$LOG_FILE"
        if sudo systemctl restart calvin-frontend-dev 2>/dev/null; then
            echo "Frontend dev service restarted successfully" | tee -a "$LOG_FILE"
        elif systemctl --user restart calvin-frontend-dev 2>/dev/null; then
            echo "Frontend dev service restarted successfully (user service)" | tee -a "$LOG_FILE"
        else
            echo "Note: Frontend dev service has hot reload, so manual restart may not be necessary" | tee -a "$LOG_FILE"
        fi
    fi
else
    echo "Services not running. Please start them manually." | tee -a "$LOG_FILE"
fi

echo "[$(date)] Development update complete!" | tee -a "$LOG_FILE"
echo "Note: Services have hot reload enabled, so changes should be reflected automatically." | tee -a "$LOG_FILE"
