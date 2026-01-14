#!/bin/bash
# Test script to verify update scripts are properly installed and detected
# Run this on your running Calvin instance

set -e

REPO_DIR="${REPO_DIR:-/home/calvin/calvin}"
CALVIN_USER="${CALVIN_USER:-calvin}"

# Source environment file if it exists (contains GIT_REPO and GIT_BRANCH)
if [ -f /etc/default/calvin-update ]; then
    . /etc/default/calvin-update
fi

GIT_REPO="${GIT_REPO:-https://github.com/osterbergsimon/calvin.git}"
GIT_BRANCH="${GIT_BRANCH:-main}"

# Extract repo owner and name from git URL
repo_owner=$(echo "${GIT_REPO}" | sed -E 's|.*github\.com[:/]([^/]+)/([^/]+)(\.git)?$|\1|')
repo_name=$(echo "${GIT_REPO}" | sed -E 's|.*github\.com[:/]([^/]+)/([^/]+)(\.git)?$|\2|' | sed 's|\.git$||')
GITHUB_BASE="https://raw.githubusercontent.com/${repo_owner}/${repo_name}/${GIT_BRANCH}"

echo "=========================================="
echo "Testing Update Scripts Installation"
echo "=========================================="
echo ""

# Check if we're in dev or prod mode
if [ -f "${REPO_DIR}/backend/.dev" ]; then
    echo "✓ Detected: DEVELOPMENT mode (.dev marker exists)"
    EXPECTED_SCRIPT="/usr/local/bin/update-calvin-dev.sh"
    MODE="dev"
else
    echo "✓ Detected: PRODUCTION mode (no .dev marker)"
    EXPECTED_SCRIPT="/usr/local/bin/update-calvin-prod.sh"
    MODE="prod"
fi
echo ""

# Check if expected script exists
if [ -f "$EXPECTED_SCRIPT" ]; then
    echo "✓ Expected script exists: $EXPECTED_SCRIPT"
    ls -lh "$EXPECTED_SCRIPT"
else
    echo "✗ Expected script NOT found: $EXPECTED_SCRIPT"
    echo "  Installing now..."
    
    # Install the appropriate script
    if [ "$MODE" = "dev" ]; then
        SCRIPT_NAME="update-calvin-dev.sh"
        SCRIPT_URL="${GITHUB_BASE}/scripts/${SCRIPT_NAME}"
        LOCAL_SOURCE="${REPO_DIR}/scripts/${SCRIPT_NAME}"
        
        if [ -f "$LOCAL_SOURCE" ]; then
            echo "  Using local script: $LOCAL_SOURCE"
            sudo cp "$LOCAL_SOURCE" "$EXPECTED_SCRIPT"
        else
            echo "  Downloading from GitHub: $SCRIPT_URL"
            TEMP_SCRIPT=$(mktemp)
            if command -v curl &> /dev/null; then
                if curl -fsSL -o "$TEMP_SCRIPT" "$SCRIPT_URL"; then
                    sudo cp "$TEMP_SCRIPT" "$EXPECTED_SCRIPT"
                    rm -f "$TEMP_SCRIPT"
                else
                    echo "  ✗ Failed to download script from GitHub"
                    rm -f "$TEMP_SCRIPT"
                    exit 1
                fi
            elif command -v wget &> /dev/null; then
                if wget -q -O "$TEMP_SCRIPT" "$SCRIPT_URL"; then
                    sudo cp "$TEMP_SCRIPT" "$EXPECTED_SCRIPT"
                    rm -f "$TEMP_SCRIPT"
                else
                    echo "  ✗ Failed to download script from GitHub"
                    rm -f "$TEMP_SCRIPT"
                    exit 1
                fi
            else
                echo "  ✗ Neither curl nor wget available. Cannot download script."
                exit 1
            fi
        fi
        sudo chmod +x "$EXPECTED_SCRIPT"
        sudo chown "${CALVIN_USER}:${CALVIN_USER}" "$EXPECTED_SCRIPT"
        echo "  ✓ Installed $SCRIPT_NAME"
    else
        SCRIPT_NAME="update-calvin-prod.sh"
        SCRIPT_URL="${GITHUB_BASE}/scripts/${SCRIPT_NAME}"
        LOCAL_SOURCE="${REPO_DIR}/scripts/${SCRIPT_NAME}"
        
        if [ -f "$LOCAL_SOURCE" ]; then
            echo "  Using local script: $LOCAL_SOURCE"
            sudo cp "$LOCAL_SOURCE" "$EXPECTED_SCRIPT"
        else
            echo "  Downloading from GitHub: $SCRIPT_URL"
            TEMP_SCRIPT=$(mktemp)
            if command -v curl &> /dev/null; then
                if curl -fsSL -o "$TEMP_SCRIPT" "$SCRIPT_URL"; then
                    sudo cp "$TEMP_SCRIPT" "$EXPECTED_SCRIPT"
                    rm -f "$TEMP_SCRIPT"
                else
                    echo "  ✗ Failed to download script from GitHub"
                    rm -f "$TEMP_SCRIPT"
                    exit 1
                fi
            elif command -v wget &> /dev/null; then
                if wget -q -O "$TEMP_SCRIPT" "$SCRIPT_URL"; then
                    sudo cp "$TEMP_SCRIPT" "$EXPECTED_SCRIPT"
                    rm -f "$TEMP_SCRIPT"
                else
                    echo "  ✗ Failed to download script from GitHub"
                    rm -f "$TEMP_SCRIPT"
                    exit 1
                fi
            else
                echo "  ✗ Neither curl nor wget available. Cannot download script."
                exit 1
            fi
        fi
        sudo chmod +x "$EXPECTED_SCRIPT"
        sudo chown "${CALVIN_USER}:${CALVIN_USER}" "$EXPECTED_SCRIPT"
        echo "  ✓ Installed $SCRIPT_NAME"
    fi
fi
echo ""

# Check symlink
if [ -L "/usr/local/bin/update-calvin.sh" ]; then
    LINK_TARGET=$(readlink -f /usr/local/bin/update-calvin.sh)
    echo "✓ Symlink exists: /usr/local/bin/update-calvin.sh -> $LINK_TARGET"
    if [ "$LINK_TARGET" = "$EXPECTED_SCRIPT" ]; then
        echo "  ✓ Symlink points to correct script"
    else
        echo "  ⚠ Symlink points to different script, updating..."
        sudo rm /usr/local/bin/update-calvin.sh
        sudo ln -s "$EXPECTED_SCRIPT" /usr/local/bin/update-calvin.sh
        sudo chown -h "${CALVIN_USER}:${CALVIN_USER}" /usr/local/bin/update-calvin.sh
        echo "  ✓ Symlink updated"
    fi
else
    echo "⚠ Symlink missing, creating..."
    sudo ln -s "$EXPECTED_SCRIPT" /usr/local/bin/update-calvin.sh
    sudo chown -h "${CALVIN_USER}:${CALVIN_USER}" /usr/local/bin/update-calvin.sh
    echo "  ✓ Symlink created"
fi
echo ""

# Check update config
if [ -f "/etc/default/calvin-update" ]; then
    echo "✓ Update config exists: /etc/default/calvin-update"
    echo "  Contents:"
    cat /etc/default/calvin-update | sed 's/^/    /'
else
    echo "⚠ Update config missing: /etc/default/calvin-update"
    echo "  Creating default config..."
    sudo tee /etc/default/calvin-update > /dev/null << EOF
GIT_REPO=${GIT_REPO:-https://github.com/osterbergsimon/calvin.git}
GIT_BRANCH=${GIT_BRANCH:-main}
REPO_DIR=${REPO_DIR}
EOF
    echo "  ✓ Default config created"
fi
echo ""

# Test backend detection (if backend is running)
echo "Testing backend detection..."
if systemctl is-active --quiet calvin-backend.service 2>/dev/null || sudo systemctl is-active --quiet calvin-backend.service 2>/dev/null; then
    echo "  Backend service is running"
    echo "  You can test the API endpoint:"
    echo "    curl http://localhost:8000/api/system/update/status"
    echo ""
    echo "  Or trigger an update (dry-run by checking logs first):"
    echo "    sudo -u ${CALVIN_USER} $EXPECTED_SCRIPT"
else
    echo "  ⚠ Backend service is not running"
    echo "  Start it to test API detection:"
    echo "    sudo systemctl start calvin-backend"
fi
echo ""

echo "=========================================="
echo "Summary"
echo "=========================================="
echo "Mode: $MODE"
echo "Script: $EXPECTED_SCRIPT"
echo "Symlink: /usr/local/bin/update-calvin.sh"
echo ""
echo "To test the update script manually:"
echo "  sudo -u ${CALVIN_USER} $EXPECTED_SCRIPT"
echo ""
echo "To test via API (after restarting backend):"
echo "  curl -X POST http://localhost:8000/api/system/update"
echo ""
