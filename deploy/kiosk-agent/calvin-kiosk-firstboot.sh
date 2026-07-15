#!/usr/bin/env bash
# Boot-2 oneshot: run setup-kiosk.sh with the seeded backend URL, then reboot.
# Idempotent via a sentinel so a re-run (or a failed reboot) is safe.
set -euo pipefail

SENTINEL="${CALVIN_FIRSTBOOT_SENTINEL:-/var/lib/calvin/firstboot.done}"
ENV_FILE="${CALVIN_KIOSK_ENV_FILE:-/etc/default/calvin-kiosk}"

[ -f "${SENTINEL}" ] && exit 0

if [ -f "${ENV_FILE}" ]; then
    # shellcheck disable=SC1090
    . "${ENV_FILE}"
fi
: "${CALVIN_BACKEND_URL:?CALVIN_BACKEND_URL not seeded}"
: "${CALVIN_SETUP_KIOSK_URL:?CALVIN_SETUP_KIOSK_URL not seeded}"

curl -fsSL "${CALVIN_SETUP_KIOSK_URL}" | bash -s -- --backend-url "${CALVIN_BACKEND_URL}"

mkdir -p "$(dirname "${SENTINEL}")"
touch "${SENTINEL}"
systemctl disable calvin-kiosk-firstboot.service >/dev/null 2>&1 || true
systemctl reboot
