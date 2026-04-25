#!/bin/bash
# Helper script to restart Calvin services (invoked via sudo NOPASSWD for the app user).
#
# When installed under /usr/local/bin it must be root-owned (e.g. root:root 0755), not
# owned by the calvin user — otherwise a compromised app could replace this file and
# escalate privileges the next time sudo runs it.

set -e

SERVICE="${1:-}"

LOG_FILE="${LOG_FILE:-/home/calvin/calvin/backend/logs/calvin-restart.log}"

# Create log directory if it doesn't exist
mkdir -p "$(dirname "$LOG_FILE")"

echo "[$(date)] Attempting to restart service: ${SERVICE:-all}" | tee -a "$LOG_FILE"

# Function to restart a service
restart_service() {
    local service_name="$1"
    echo "[$(date)] Restarting $service_name..." | tee -a "$LOG_FILE"
    
    if command -v systemctl >/dev/null 2>&1; then
        if systemctl restart "$service_name" 2>&1 | tee -a "$LOG_FILE"; then
            echo "[$(date)] Successfully restarted $service_name via systemctl" | tee -a "$LOG_FILE"
            return 0
        else
            echo "[$(date)] Failed to restart $service_name via systemctl" | tee -a "$LOG_FILE"
            return 1
        fi
    else
        echo "[$(date)] ERROR: systemctl not found!" | tee -a "$LOG_FILE"
        return 1
    fi
}

# Restart specific service or all services
if [ -n "$SERVICE" ]; then
    # Restart specific service
    case "$SERVICE" in
        backend|calvin-backend|calvin-backend.service)
            restart_service "calvin-backend.service"
            ;;
        frontend|calvin-frontend|calvin-frontend.service)
            restart_service "calvin-frontend.service"
            ;;
        *)
            echo "[$(date)] ERROR: Unknown service: $SERVICE" | tee -a "$LOG_FILE"
            echo "Valid services: backend, frontend" | tee -a "$LOG_FILE"
            exit 1
            ;;
    esac
else
    # Restart all services
    echo "[$(date)] Restarting all Calvin services..." | tee -a "$LOG_FILE"
    restart_service "calvin-backend.service"
    restart_service "calvin-frontend.service"
fi

echo "[$(date)] Service restart completed" | tee -a "$LOG_FILE"
exit 0
