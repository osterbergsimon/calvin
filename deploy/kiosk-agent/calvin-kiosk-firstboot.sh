#!/usr/bin/env bash
# Boot-2 oneshot: wait for the Calvin server, run the baked kiosk installer
# against it (it fetches the setup scripts from the server), then reboot.
# Idempotent via a sentinel so a re-run (or a failed reboot) is safe.
set -euo pipefail

SENTINEL="${CALVIN_FIRSTBOOT_SENTINEL:-/var/lib/calvin/firstboot.done}"
ENV_FILE="${CALVIN_KIOSK_ENV_FILE:-/etc/default/calvin-kiosk}"
INSTALLER="${CALVIN_KIOSK_INSTALLER:-/usr/local/bin/calvin-kiosk-install.sh}"
WAIT_SECS="${CALVIN_FIRSTBOOT_WAIT_SECS:-900}"
POLL_SECS="${CALVIN_FIRSTBOOT_POLL_SECS:-10}"

[ -f "${SENTINEL}" ] && exit 0

if [ -f "${ENV_FILE}" ]; then
    # shellcheck disable=SC1090
    . "${ENV_FILE}"
fi
: "${CALVIN_BACKEND_URL:?CALVIN_BACKEND_URL not seeded}"
url="${CALVIN_BACKEND_URL%/}"

# network-online.target only means "an address"; wifi association, DNS, or the
# server itself (e.g. Unraid still booting after a power cut) may lag behind.
deadline=$((SECONDS + WAIT_SECS))
until curl -fsS -o /dev/null --max-time 5 "${url}/api/health"; do
    if [ "${SECONDS}" -ge "${deadline}" ]; then
        echo "Calvin server ${url} unreachable after ${WAIT_SECS}s; giving up" >&2
        exit 1
    fi
    echo "Waiting for Calvin server ${url}..."
    sleep "${POLL_SECS}"
done

bash "${INSTALLER}" --backend-url "${url}" --no-reboot

mkdir -p "$(dirname "${SENTINEL}")"
touch "${SENTINEL}"
systemctl disable calvin-kiosk-firstboot.service >/dev/null 2>&1 || true
systemctl reboot
