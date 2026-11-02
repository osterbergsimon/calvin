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
CONSOLE="${CALVIN_FIRSTBOOT_CONSOLE:-/dev/tty1}"

# The kiosk has no X yet: say what is happening on the screen (tty1) as well
# as in the journal, so a blank-looking Pi is not a mystery.
status() {
    echo "$*"
    if [ -w "${CONSOLE}" ]; then
        printf '\r\n[Calvin setup] %s\r\n' "$*" >> "${CONSOLE}" 2>/dev/null || true
    fi
}

addresses() {
    hostname -I 2>/dev/null | tr -s ' ' | sed 's/ $//' || true
}

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
status "Waiting for the Calvin server at ${url} (this kiosk: $(hostname 2>/dev/null) $(addresses))"
until curl -fsS -o /dev/null --max-time 5 "${url}/api/health"; do
    if [ "${SECONDS}" -ge "${deadline}" ]; then
        status "Calvin server ${url} unreachable after ${WAIT_SECS}s. Check that it is running and reachable; will retry in a minute."
        exit 1
    fi
    echo "Waiting for Calvin server ${url}..."
    sleep "${POLL_SECS}"
done

status "Installing the Calvin kiosk from ${url} (takes a few minutes)..."
if ! bash "${INSTALLER}" --backend-url "${url}" --no-reboot; then
    status "Kiosk install failed; will retry in a minute. Details: journalctl -u calvin-kiosk-firstboot"
    exit 1
fi
status "Kiosk installed; rebooting into the dashboard."

mkdir -p "$(dirname "${SENTINEL}")"
touch "${SENTINEL}"
systemctl disable calvin-kiosk-firstboot.service >/dev/null 2>&1 || true
systemctl reboot
