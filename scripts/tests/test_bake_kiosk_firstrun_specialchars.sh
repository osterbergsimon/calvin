#!/usr/bin/env bash
# Regression test: baked values containing shell-special characters (', ", $, \,
# space) must produce a syntactically valid firstrun.sh and round-trip correctly.
set -euo pipefail

# shellcheck disable=SC1090
source "$(dirname "$0")/../bake-kiosk-firstrun.sh" --source-only 2>/dev/null || true

# Values with every nasty character class:
TRICKY_PSK="p@ss'w\"o\$rd x"
TRICKY_SSID="My Net's\"Wi\$Fi"
TRICKY_HOST="kit'chen\$1"

parse_args \
    --backend-url http://h:8000 \
    --boot-dir /tmp \
    --wifi-ssid "${TRICKY_SSID}" \
    --wifi-psk  "${TRICKY_PSK}" \
    --wifi-country SE \
    --hostname  "${TRICKY_HOST}"

generated="$(emit_firstrun)"

# 1. Generated script must be syntactically valid bash.
echo "${generated}" | bash -n - \
    || { echo "FAIL: generated firstrun.sh fails bash -n"; exit 1; }

# 2. Round-trip: eval only the baked assignment lines in a clean subshell and
#    confirm each variable holds the exact original string.
eval_result="$(
    eval "$(echo "${generated}" | grep -E '^(WIFI_PSK|WIFI_SSID|CALVIN_HOSTNAME)=')"
    echo "PSK=${WIFI_PSK}"
    echo "SSID=${WIFI_SSID}"
    echo "HOST=${CALVIN_HOSTNAME}"
)"

got_psk="$(echo "${eval_result}"  | grep '^PSK='  | cut -d= -f2-)"
got_ssid="$(echo "${eval_result}" | grep '^SSID=' | cut -d= -f2-)"
got_host="$(echo "${eval_result}" | grep '^HOST=' | cut -d= -f2-)"

[ "${got_psk}"  = "${TRICKY_PSK}"  ] \
    || { echo "FAIL: WIFI_PSK round-trip: expected '${TRICKY_PSK}' got '${got_psk}'"; exit 1; }
[ "${got_ssid}" = "${TRICKY_SSID}" ] \
    || { echo "FAIL: WIFI_SSID round-trip: expected '${TRICKY_SSID}' got '${got_ssid}'"; exit 1; }
[ "${got_host}" = "${TRICKY_HOST}" ] \
    || { echo "FAIL: CALVIN_HOSTNAME round-trip: expected '${TRICKY_HOST}' got '${got_host}'"; exit 1; }

echo "PASS"
