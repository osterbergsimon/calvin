#!/bin/bash
# Helper script to rebuild and restart the frontend
# This script rebuilds the frontend and restarts the necessary services
# Can be run from anywhere, will find the project root automatically

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
    exit 1
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

# Try to determine project root
# First, try to find it relative to script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# If that doesn't work, try common locations
if [ ! -d "$PROJECT_ROOT/frontend" ]; then
    # Try default calvin location
    if [ -d "/home/calvin/calvin/frontend" ]; then
        PROJECT_ROOT="/home/calvin/calvin"
    # Try current directory
    elif [ -d "./frontend" ]; then
        PROJECT_ROOT="$(pwd)"
    else
        error "Could not find project root. Please run from project directory or set CALVIN_DIR environment variable."
    fi
fi

# Allow override via environment variable
PROJECT_ROOT="${CALVIN_DIR:-$PROJECT_ROOT}"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

log "Starting frontend rebuild..."
log "Project root: $PROJECT_ROOT"
log "Frontend directory: $FRONTEND_DIR"

# Check if frontend directory exists
if [ ! -d "$FRONTEND_DIR" ]; then
    error "Frontend directory not found: $FRONTEND_DIR"
fi

# Check if package.json exists
if [ ! -f "$FRONTEND_DIR/package.json" ]; then
    error "package.json not found in frontend directory"
fi

# Change to frontend directory
cd "$FRONTEND_DIR" || error "Failed to change to frontend directory"

# Check if node_modules exists, if not install dependencies
if [ ! -d "node_modules" ]; then
    log "node_modules not found. Installing dependencies..."
    npm install
else
    log "Dependencies already installed, skipping npm install"
fi

# Build frontend
log "Building frontend..."
if ! npm run build; then
    error "Frontend build failed"
fi

log "Frontend build completed successfully"

# Check if we're on a system with systemd (Linux/Raspberry Pi)
if command -v systemctl >/dev/null 2>&1; then
    # Check if backend service is running
    if systemctl is-active --quiet calvin-backend.service 2>/dev/null || sudo systemctl is-active --quiet calvin-backend.service 2>/dev/null; then
        log "Restarting backend service to serve new frontend build..."
        # Try with sudo first (most common case on Pi)
        if sudo systemctl restart calvin-backend 2>/dev/null; then
            log "Backend service restarted successfully"
        elif systemctl --user restart calvin-backend 2>/dev/null; then
            log "Backend service restarted successfully (user service)"
        else
            warn "Failed to restart backend service (may need sudo permissions)"
            warn "Please restart manually: sudo systemctl restart calvin-backend"
        fi
    else
        log "Backend service is not running. New build will be served when backend starts."
    fi

    # Optionally restart frontend service (Chromium) to force reload
    # This is optional since Chromium should reload automatically, but can help with cache issues
    if systemctl is-active --quiet calvin-frontend.service 2>/dev/null || sudo systemctl is-active --quiet calvin-frontend.service 2>/dev/null; then
        log "Restarting frontend service (Chromium) to force reload..."
        if sudo systemctl restart calvin-frontend 2>/dev/null; then
            log "Frontend service restarted successfully"
        elif systemctl --user restart calvin-frontend 2>/dev/null; then
            log "Frontend service restarted successfully (user service)"
        else
            warn "Failed to restart frontend service (may need sudo permissions)"
            warn "You may need to manually refresh the browser or restart: sudo systemctl restart calvin-frontend"
        fi
    else
        log "Frontend service is not running. New build will be served when frontend starts."
    fi
else
    log "systemctl not found. Skipping service restart."
    log "If running in development, restart your backend server to serve the new build."
fi

log "Frontend rebuild complete!"
log "The new build is available in: $FRONTEND_DIR/dist"

