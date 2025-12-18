#!/bin/bash
# Auto-update script for Calvin Dashboard
# Pulls latest code from GitHub and restarts services

# Don't use set -e - we want to continue even if some steps fail
set +e

# Save environment variables before sourcing config file
# This ensures environment variables (passed from API) take precedence over file values
SAVED_GIT_BRANCH="${GIT_BRANCH:-}"
SAVED_GIT_REPO="${GIT_REPO:-}"
SAVED_REPO_DIR="${REPO_DIR:-}"

# Source environment file if it exists
if [ -f /etc/default/calvin-update ]; then
    . /etc/default/calvin-update
fi

# Restore environment variables if they were set (they take precedence)
if [ -n "$SAVED_GIT_BRANCH" ]; then
    GIT_BRANCH="$SAVED_GIT_BRANCH"
fi
if [ -n "$SAVED_GIT_REPO" ]; then
    GIT_REPO="$SAVED_GIT_REPO"
fi
if [ -n "$SAVED_REPO_DIR" ]; then
    REPO_DIR="$SAVED_REPO_DIR"
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
echo "[$(date)] Repository: $GIT_REPO" | tee -a "$LOG_FILE"
if [ -n "$SAVED_GIT_BRANCH" ]; then
    echo "[$(date)] Branch: $GIT_BRANCH (from environment variable)" | tee -a "$LOG_FILE"
else
    echo "[$(date)] Branch: $GIT_BRANCH (from /etc/default/calvin-update or default)" | tee -a "$LOG_FILE"
fi

# Check if git repo exists
if [ ! -d ".git" ]; then
    echo "Not a git repository. Cloning..." | tee -a "$LOG_FILE"
    git clone "$GIT_REPO" "$REPO_DIR"
    cd "$REPO_DIR"
    git checkout "$GIT_BRANCH"
    HAS_CHANGES=true
else
    # Check current commit before fetching
    CURRENT_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "")
    CURRENT_COMMIT_SHORT=$(git rev-parse --short HEAD 2>/dev/null || echo "")
    CURRENT_COMMIT_MSG=$(git log -1 --pretty=format:"%s" HEAD 2>/dev/null || echo "")
    CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
    
    if [ -n "$CURRENT_COMMIT" ]; then
        echo "Current commit: $CURRENT_COMMIT_SHORT ($CURRENT_COMMIT)" | tee -a "$LOG_FILE"
        echo "Current commit message: $CURRENT_COMMIT_MSG" | tee -a "$LOG_FILE"
    fi
    if [ -n "$CURRENT_BRANCH" ]; then
        echo "Current branch: $CURRENT_BRANCH" | tee -a "$LOG_FILE"
    fi
    
    # Fetch latest code first to ensure we have remote branch info
    echo "Fetching latest code from origin (will use branch: $GIT_BRANCH)..." | tee -a "$LOG_FILE"
    if ! git fetch origin; then
        echo "Warning: Failed to fetch from origin" | tee -a "$LOG_FILE"
        exit 0  # Don't fail the service, just skip this update
    fi
    
    # Ensure we're on the correct branch
    if [ "$CURRENT_BRANCH" != "$GIT_BRANCH" ]; then
        echo "Switching to branch $GIT_BRANCH (currently on $CURRENT_BRANCH)..." | tee -a "$LOG_FILE"
        # Check if the branch exists locally
        if git show-ref --verify --quiet refs/heads/"$GIT_BRANCH"; then
            # Branch exists locally, just checkout
            if ! git checkout "$GIT_BRANCH"; then
                echo "Warning: Failed to checkout local branch $GIT_BRANCH" | tee -a "$LOG_FILE"
                exit 0
            fi
        else
            # Branch doesn't exist locally, create it from origin
            if git show-ref --verify --quiet refs/remotes/origin/"$GIT_BRANCH"; then
                # Remote branch exists, create local tracking branch
                if ! git checkout -b "$GIT_BRANCH" "origin/$GIT_BRANCH"; then
                    echo "Warning: Failed to create and checkout branch $GIT_BRANCH from origin" | tee -a "$LOG_FILE"
                    exit 0
                fi
            else
                echo "Warning: Branch $GIT_BRANCH does not exist on origin" | tee -a "$LOG_FILE"
                exit 0
            fi
        fi
        echo "Successfully switched to branch $GIT_BRANCH" | tee -a "$LOG_FILE"
    fi
    
    # Update current commit info after branch switch
    CURRENT_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "")
    CURRENT_COMMIT_SHORT=$(git rev-parse --short HEAD 2>/dev/null || echo "")
    CURRENT_COMMIT_MSG=$(git log -1 --pretty=format:"%s" HEAD 2>/dev/null || echo "")
    
    # Check if there are any changes
    NEW_COMMIT=$(git rev-parse "origin/$GIT_BRANCH" 2>/dev/null || echo "")
    NEW_COMMIT_SHORT=$(git rev-parse --short "origin/$GIT_BRANCH" 2>/dev/null || echo "")
    NEW_COMMIT_MSG=$(git log -1 --pretty=format:"%s" "origin/$GIT_BRANCH" 2>/dev/null || echo "")
    
    if [ -n "$NEW_COMMIT" ]; then
        echo "Latest commit on remote: $NEW_COMMIT_SHORT ($NEW_COMMIT)" | tee -a "$LOG_FILE"
        echo "Latest commit message: $NEW_COMMIT_MSG" | tee -a "$LOG_FILE"
    fi
    
    if [ "$CURRENT_COMMIT" = "$NEW_COMMIT" ]; then
        echo "No changes detected. Already up to date at commit $CURRENT_COMMIT_SHORT" | tee -a "$LOG_FILE"
        HAS_CHANGES=false
    else
        echo "Changes detected. Updating from $CURRENT_COMMIT_SHORT to $NEW_COMMIT_SHORT..." | tee -a "$LOG_FILE"
        if [ -n "$CURRENT_COMMIT" ] && [ -n "$NEW_COMMIT" ]; then
            # Show what files changed
            CHANGED_FILES=$(git diff --name-only "$CURRENT_COMMIT" "$NEW_COMMIT" 2>/dev/null | head -20)
            if [ -n "$CHANGED_FILES" ]; then
                echo "Files to be updated:" | tee -a "$LOG_FILE"
                echo "$CHANGED_FILES" | while read -r file; do
                    echo "  - $file" | tee -a "$LOG_FILE"
                done
            fi
        fi
        
        if ! git reset --hard "origin/$GIT_BRANCH"; then
            echo "Warning: Failed to reset to $GIT_BRANCH" | tee -a "$LOG_FILE"
            exit 0  # Don't fail the service, just skip this update
        fi
        echo "Successfully updated to commit $NEW_COMMIT_SHORT" | tee -a "$LOG_FILE"
        HAS_CHANGES=true
    fi
fi

# Update the update script itself if it exists in the repo
if [ -f "$REPO_DIR/scripts/update-calvin.sh" ] && [ -f "/usr/local/bin/update-calvin.sh" ]; then
    echo "Updating update script..." | tee -a "$LOG_FILE"
    cp "$REPO_DIR/scripts/update-calvin.sh" /usr/local/bin/update-calvin.sh
    chmod +x /usr/local/bin/update-calvin.sh
    chown calvin:calvin /usr/local/bin/update-calvin.sh 2>/dev/null || true
fi

# Only update dependencies and rebuild if there are changes
if [ "$HAS_CHANGES" = true ]; then
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

    # Always rebuild frontend when there are any changes to ensure cache busting
    # This ensures users get the latest version even if only backend changed
    echo "Rebuilding frontend to force cache update..." | tee -a "$LOG_FILE"
    cd "$REPO_DIR/frontend"
    if ! npm ci; then
        echo "Warning: Failed to update frontend dependencies" | tee -a "$LOG_FILE"
        exit 0  # Don't fail the service
    fi

    # Rebuild frontend (this will update the build timestamp for cache busting)
    echo "Rebuilding frontend..." | tee -a "$LOG_FILE"
    if ! npm run build 2>&1 | tee -a "$LOG_FILE"; then
        echo "Warning: Failed to build frontend" | tee -a "$LOG_FILE"
        exit 0  # Don't fail the service
    fi
    echo "Frontend build completed successfully" | tee -a "$LOG_FILE"
else
    echo "No changes detected. Skipping dependency updates and rebuilds." | tee -a "$LOG_FILE"
fi

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
    # Restart frontend (Chromium) to force cache clear and reload
    # This is critical - Chromium in kiosk mode may cache files even with no-cache headers
    echo "Restarting frontend service (Chromium) to clear cache and reload..." | tee -a "$LOG_FILE"
    if sudo systemctl restart calvin-frontend 2>/dev/null; then
        echo "Frontend service restarted successfully" | tee -a "$LOG_FILE"
    elif systemctl --user restart calvin-frontend 2>/dev/null; then
        echo "Frontend service restarted successfully (user service)" | tee -a "$LOG_FILE"
    else
        echo "Warning: Failed to restart frontend (may need sudo permissions)" | tee -a "$LOG_FILE"
        echo "Please restart manually: sudo systemctl restart calvin-frontend" | tee -a "$LOG_FILE"
        echo "Or clear Chromium cache: rm -rf ~/.cache/chromium" | tee -a "$LOG_FILE"
    fi
else
    echo "Services not running. Please start them manually." | tee -a "$LOG_FILE"
fi

echo "[$(date)] Update complete!" | tee -a "$LOG_FILE"

