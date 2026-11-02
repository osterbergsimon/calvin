#!/bin/bash
# Helper script to restart Calvin systemd services.
#
# When installed under /usr/local/bin it must be root-owned (root:root 0755), not
# owned by the calvin user, because the app may invoke it via sudo NOPASSWD.

set -e

SERVICE="${1:-}"
LOG_FILE="${LOG_FILE:-/var/lib/calvin/logs/calvin-restart.log}"

mkdir -p "$(dirname "$LOG_FILE")"

echo "[$(date)] Attempting to restart service: ${SERVICE:-all}" | tee -a "$LOG_FILE"

restart_service() {
    local service_name="$1"
    echo "[$(date)] Restarting $service_name..." | tee -a "$LOG_FILE"

    if ! command -v systemctl >/dev/null 2>&1; then
        echo "[$(date)] ERROR: systemctl not found" | tee -a "$LOG_FILE"
        return 1
    fi

    if systemctl restart "$service_name" 2>&1 | tee -a "$LOG_FILE"; then
        echo "[$(date)] Successfully restarted $service_name" | tee -a "$LOG_FILE"
        return 0
    fi

    echo "[$(date)] Failed to restart $service_name" | tee -a "$LOG_FILE"
    return 1
}

if [ -n "$SERVICE" ]; then
    case "$SERVICE" in
        app|calvin-app|calvin-app.service)
            restart_service "calvin-app.service"
            ;;
        kiosk|frontend|calvin-kiosk|calvin-kiosk.service|calvin-frontend|calvin-frontend.service)
            restart_service "calvin-kiosk.service"
            ;;
        x|calvin-x|calvin-x.service)
            restart_service "calvin-x.service"
            ;;
        *)
            echo "[$(date)] ERROR: Unknown service: $SERVICE" | tee -a "$LOG_FILE"
            echo "Valid services: app, kiosk, x" | tee -a "$LOG_FILE"
            exit 1
            ;;
    esac
else
    echo "[$(date)] Restarting all Calvin services..." | tee -a "$LOG_FILE"
    restart_service "calvin-app.service"
    restart_service "calvin-x.service"
    restart_service "calvin-kiosk.service"
fi

echo "[$(date)] Service restart completed" | tee -a "$LOG_FILE"
exit 0
