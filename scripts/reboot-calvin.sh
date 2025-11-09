#!/bin/bash
# Helper script to reboot the system
# This script can be run with sudo permissions

set -e

LOG_FILE="${LOG_FILE:-/home/calvin/calvin/backend/logs/calvin-reboot.log}"

# Create log directory if it doesn't exist
mkdir -p "$(dirname "$LOG_FILE")"

echo "[$(date)] Attempting system reboot..." | tee -a "$LOG_FILE"

# Try multiple methods to reboot
# Method 1: systemctl reboot (preferred)
if command -v systemctl >/dev/null 2>&1; then
    echo "[$(date)] Trying systemctl reboot..." | tee -a "$LOG_FILE"
    if systemctl reboot 2>&1 | tee -a "$LOG_FILE"; then
        echo "[$(date)] Reboot initiated via systemctl" | tee -a "$LOG_FILE"
        exit 0
    fi
fi

# Method 2: sudo reboot
if command -v sudo >/dev/null 2>&1; then
    echo "[$(date)] Trying sudo reboot..." | tee -a "$LOG_FILE"
    if sudo reboot 2>&1 | tee -a "$LOG_FILE"; then
        echo "[$(date)] Reboot initiated via sudo reboot" | tee -a "$LOG_FILE"
        exit 0
    fi
fi

# Method 3: /sbin/reboot
if [ -x /sbin/reboot ]; then
    echo "[$(date)] Trying /sbin/reboot..." | tee -a "$LOG_FILE"
    if /sbin/reboot 2>&1 | tee -a "$LOG_FILE"; then
        echo "[$(date)] Reboot initiated via /sbin/reboot" | tee -a "$LOG_FILE"
        exit 0
    fi
fi

# Method 4: /usr/sbin/reboot
if [ -x /usr/sbin/reboot ]; then
    echo "[$(date)] Trying /usr/sbin/reboot..." | tee -a "$LOG_FILE"
    if /usr/sbin/reboot 2>&1 | tee -a "$LOG_FILE"; then
        echo "[$(date)] Reboot initiated via /usr/sbin/reboot" | tee -a "$LOG_FILE"
        exit 0
    fi
fi

echo "[$(date)] ERROR: All reboot methods failed!" | tee -a "$LOG_FILE"
exit 1

