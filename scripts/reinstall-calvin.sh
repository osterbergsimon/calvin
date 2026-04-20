#!/bin/bash
# Complete Calvin reinstall script
# Performs a full reinstall with options to keep database and/or images
# If database is kept, checks and runs migrations if needed
#
# Usage:
#   sudo ./reinstall-calvin.sh [--keep-db] [--keep-images]
#
# Options:
#   --keep-db       Keep the existing database (will check and run migrations if needed)
#   --keep-images   Keep the existing images directory

set -euo pipefail

# Source setup-common.sh if available
COMMON_SCRIPT=""
if [ -f "./setup-common.sh" ]; then
    COMMON_SCRIPT="./setup-common.sh"
elif [ -n "${BASH_VERSION:-}" ]; then
    _script_dir=$(bash -c 'if [ -n "${BASH_SOURCE[0]:-}" ] && [ "${BASH_SOURCE[0]}" != "-" ]; then cd "$(dirname "${BASH_SOURCE[0]}")" && pwd; fi' 2>/dev/null || echo "")
    if [ -n "${_script_dir}" ] && [ -f "${_script_dir}/setup-common.sh" ]; then
        COMMON_SCRIPT="${_script_dir}/setup-common.sh"
    fi
fi

if [ -n "${COMMON_SCRIPT}" ] && [ -f "${COMMON_SCRIPT}" ]; then
    . "${COMMON_SCRIPT}"
else
    # Minimal logging functions if setup-common.sh not available
    log() {
        echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"
    }
    log_warn() {
        echo "[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $*"
    }
    log_error() {
        echo "[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2
    }
    error_exit() {
        log_error "$1"
        exit "${2:-1}"
    }
    DEFAULT_CALVIN_DIR="/home/calvin/calvin"
    DEFAULT_CALVIN_USER="calvin"
fi

# Configuration
CALVIN_DIR="${CALVIN_DIR:-$DEFAULT_CALVIN_DIR}"
CALVIN_USER="${CALVIN_USER:-$DEFAULT_CALVIN_USER}"
LOG_FILE="${LOG_FILE:-/var/log/calvin-reinstall.log}"

# Parse command-line arguments
KEEP_DB=false
KEEP_IMAGES=false

for arg in "$@"; do
    case "$arg" in
        --keep-db)
            KEEP_DB=true
            ;;
        --keep-images)
            KEEP_IMAGES=true
            ;;
        --help|-h)
            echo "Usage: $0 [--keep-db] [--keep-images]"
            echo ""
            echo "Options:"
            echo "  --keep-db       Keep the existing database (will check and run migrations if needed)"
            echo "  --keep-images   Keep the existing images directory"
            exit 0
            ;;
        *)
            log_error "Unknown option: $arg"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    error_exit "This script must be run as root (use sudo)" 1
fi

# Create log directory
mkdir -p "$(dirname "$LOG_FILE")"
touch "$LOG_FILE" || LOG_FILE="/tmp/calvin-reinstall.log"

log "=========================================="
log "Calvin Complete Reinstall"
log "=========================================="
log "Directory: ${CALVIN_DIR}"
log "User: ${CALVIN_USER}"
log "Keep database: ${KEEP_DB}"
log "Keep images: ${KEEP_IMAGES}"
log ""

# Verify Calvin directory exists
if [ ! -d "${CALVIN_DIR}" ]; then
    error_exit "Calvin directory does not exist: ${CALVIN_DIR}" 1
fi

# Verify user exists
if ! id "${CALVIN_USER}" &>/dev/null; then
    error_exit "User ${CALVIN_USER} does not exist" 1
fi

# Define paths
BACKEND_DIR="${CALVIN_DIR}/backend"
FRONTEND_DIR="${CALVIN_DIR}/frontend"
DB_DIR="${BACKEND_DIR}/data/db"
DB_FILE="${DB_DIR}/calvin.db"
IMAGES_DIR="${BACKEND_DIR}/data/images"
BACKUP_DIR=$(mktemp -d)

# Backup database and images if requested
if [ "$KEEP_DB" = true ] && [ -f "${DB_FILE}" ]; then
    log "Backing up database..."
    mkdir -p "${BACKUP_DIR}/db"
    cp "${DB_FILE}" "${BACKUP_DIR}/db/calvin.db" || error_exit "Failed to backup database" 1
    log "Database backed up to ${BACKUP_DIR}/db/calvin.db"
fi

if [ "$KEEP_IMAGES" = true ] && [ -d "${IMAGES_DIR}" ]; then
    log "Backing up images..."
    mkdir -p "${BACKUP_DIR}/images"
    cp -r "${IMAGES_DIR}"/* "${BACKUP_DIR}/images/" 2>/dev/null || true
    log "Images backed up to ${BACKUP_DIR}/images/"
fi

# Stop services if they exist
log "Stopping Calvin services..."
systemctl stop calvin-backend.service 2>/dev/null || true
systemctl stop calvin-frontend.service 2>/dev/null || true
sleep 2

# Remove backend dependencies
log "Removing backend dependencies..."
cd "${BACKEND_DIR}" || error_exit "Cannot cd to ${BACKEND_DIR}" 1

# Remove UV virtual environment if it exists
if [ -d "${BACKEND_DIR}/.venv" ]; then
    log "Removing UV virtual environment..."
    rm -rf "${BACKEND_DIR}/.venv"
fi

# Remove Python cache
log "Cleaning Python cache..."
find "${BACKEND_DIR}" -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
find "${BACKEND_DIR}" -type f -name "*.pyc" -delete 2>/dev/null || true
find "${BACKEND_DIR}" -type f -name "*.pyo" -delete 2>/dev/null || true

# Remove frontend dependencies and build
log "Removing frontend dependencies and build..."
cd "${FRONTEND_DIR}" || error_exit "Cannot cd to ${FRONTEND_DIR}" 1

if [ -d "${FRONTEND_DIR}/node_modules" ]; then
    log "Removing node_modules..."
    rm -rf "${FRONTEND_DIR}/node_modules"
fi

if [ -d "${FRONTEND_DIR}/dist" ]; then
    log "Removing dist directory..."
    rm -rf "${FRONTEND_DIR}/dist"
fi

if [ -f "${FRONTEND_DIR}/package-lock.json" ]; then
    log "Removing package-lock.json..."
    rm -f "${FRONTEND_DIR}/package-lock.json"
fi

# Clean database and images if not keeping them
if [ "$KEEP_DB" = false ]; then
    log "Removing database..."
    rm -f "${DB_FILE}"
    # Also remove any database backup files
    rm -f "${DB_DIR}"/*.db-wal "${DB_DIR}"/*.db-shm 2>/dev/null || true
fi

if [ "$KEEP_IMAGES" = false ]; then
    log "Removing images..."
    rm -rf "${IMAGES_DIR:?}"/*
    # Remove cache as well
    rm -rf "${BACKEND_DIR}/data/cache/images"/* 2>/dev/null || true
fi

# Ensure data directories exist
log "Creating data directories..."
mkdir -p "${DB_DIR}"
mkdir -p "${IMAGES_DIR}"
mkdir -p "${BACKEND_DIR}/data/cache/images"
chown -R "${CALVIN_USER}:${CALVIN_USER}" "${BACKEND_DIR}/data"
chmod -R 755 "${BACKEND_DIR}/data"

# Restore database and images if they were backed up
if [ "$KEEP_DB" = true ] && [ -f "${BACKUP_DIR}/db/calvin.db" ]; then
    log "Restoring database..."
    cp "${BACKUP_DIR}/db/calvin.db" "${DB_FILE}"
    chown "${CALVIN_USER}:${CALVIN_USER}" "${DB_FILE}"
    chmod 644 "${DB_FILE}"
fi

if [ "$KEEP_IMAGES" = true ] && [ -d "${BACKUP_DIR}/images" ]; then
    log "Restoring images..."
    cp -r "${BACKUP_DIR}/images"/* "${IMAGES_DIR}/" 2>/dev/null || true
    chown -R "${CALVIN_USER}:${CALVIN_USER}" "${IMAGES_DIR}"
    chmod -R 755 "${IMAGES_DIR}"
fi

# Reinstall backend dependencies
log "Reinstalling backend dependencies..."
cd "${BACKEND_DIR}" || error_exit "Cannot cd to ${BACKEND_DIR}" 1
chown -R "${CALVIN_USER}:${CALVIN_USER}" "${BACKEND_DIR}"

# Check if UV is available
if sudo -u "${CALVIN_USER}" bash -c 'export PATH="/home/'"${CALVIN_USER}"'/.local/bin:/home/'"${CALVIN_USER}"'/.cargo/bin:$PATH" && command -v uv &> /dev/null'; then
    log "Using UV for backend installation..."
    sudo -u "${CALVIN_USER}" bash << BACKEND_INSTALL_UV_EOF
        export PATH="/home/${CALVIN_USER}/.local/bin:/home/${CALVIN_USER}/.cargo/bin:\$PATH"
        cd ${BACKEND_DIR}
        uv sync --extra linux
BACKEND_INSTALL_UV_EOF
else
    log "UV not available, using pip..."
    sudo -u "${CALVIN_USER}" bash << BACKEND_INSTALL_PIP_EOF
        cd ${BACKEND_DIR}
        python3 -m venv .venv
        source .venv/bin/activate
        pip install --upgrade pip
        pip install .[linux]
BACKEND_INSTALL_PIP_EOF
fi

if [ $? -ne 0 ]; then
    error_exit "Backend dependency installation failed" 1
fi

# Run migrations if database was kept
if [ "$KEEP_DB" = true ] && [ -f "${DB_FILE}" ]; then
    log "Database was kept. Checking and running migrations if needed..."
    
    # Check if we can run migrations (need backend to be installed)
    if [ -f "${BACKEND_DIR}/alembic.ini" ]; then
        log "Running database migrations..."
        sudo -u "${CALVIN_USER}" bash << MIGRATE_EOF
            cd ${BACKEND_DIR}
            # Try UV first, then venv, then system Python
            if command -v uv &> /dev/null 2>&1; then
                export PATH="/home/${CALVIN_USER}/.local/bin:/home/${CALVIN_USER}/.cargo/bin:\$PATH"
                uv run alembic upgrade head
            elif [ -d .venv ]; then
                source .venv/bin/activate
                alembic upgrade head
            else
                python3 -m alembic upgrade head
            fi
MIGRATE_EOF
        
        if [ $? -ne 0 ]; then
            log_warn "Migration check/run failed, but continuing..."
        else
            log "Migrations completed successfully"
        fi
    else
        log_warn "alembic.ini not found, skipping migration check"
    fi
fi

# Reinstall frontend dependencies
log "Reinstalling frontend dependencies..."
cd "${FRONTEND_DIR}" || error_exit "Cannot cd to ${FRONTEND_DIR}" 1
chown -R "${CALVIN_USER}:${CALVIN_USER}" "${FRONTEND_DIR}"

sudo -u "${CALVIN_USER}" bash -c "cd '${FRONTEND_DIR}' && npm install" || error_exit "Frontend dependency installation failed" 1

# Build frontend
log "Building frontend..."
sudo -u "${CALVIN_USER}" bash -c "cd '${FRONTEND_DIR}' && npm run build" || error_exit "Frontend build failed" 1

# Clean up backup directory
log "Cleaning up backup directory..."
rm -rf "${BACKUP_DIR}"

# Start services
log "Starting Calvin services..."
systemctl start calvin-backend.service 2>/dev/null || log_warn "Failed to start calvin-backend.service (may not be installed)"
sleep 2
systemctl start calvin-frontend.service 2>/dev/null || log_warn "Failed to start calvin-frontend.service (may not be installed)"

# Final summary
log ""
log "=========================================="
log "Calvin Reinstall Complete!"
log "=========================================="
log "Directory: ${CALVIN_DIR}"
log "Database kept: ${KEEP_DB}"
log "Images kept: ${KEEP_IMAGES}"
if [ "$KEEP_DB" = true ]; then
    log "Migrations: Checked and applied if needed"
fi
log ""
log "Services have been restarted."
log ""
