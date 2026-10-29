#!/usr/bin/env bash
# Verifies bake-kiosk-firstrun.sh argument validation.
set -euo pipefail

# shellcheck source=../bake-kiosk-firstrun.sh
source "$(dirname "$0")/../bake-kiosk-firstrun.sh" --source-only 2>/dev/null || true

tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
touch "$tmp/cmdline.txt"   # make it look like a boot partition

# Valid: backend url + boot dir.
( parse_args --backend-url http://h.local:8000 --boot-dir "$tmp"; validate_args ) \
    || { echo "FAIL: valid args rejected"; exit 1; }

# Missing backend url => reject.
if ( parse_args --boot-dir "$tmp"; validate_args ) 2>/dev/null; then
    echo "FAIL: missing backend-url accepted"; exit 1; fi

# Malformed backend url => reject.
if ( parse_args --backend-url ftp://x --boot-dir "$tmp"; validate_args ) 2>/dev/null; then
    echo "FAIL: bad scheme accepted"; exit 1; fi

# Boot dir without cmdline.txt => reject.
if ( parse_args --backend-url http://h:8000 --boot-dir "$tmp/nope"; validate_args ) 2>/dev/null; then
    echo "FAIL: non-boot dir accepted"; exit 1; fi

# Wifi ssid without country => reject.
if ( parse_args --backend-url http://h:8000 --boot-dir "$tmp" --wifi-ssid Net; validate_args ) 2>/dev/null; then
    echo "FAIL: wifi without country accepted"; exit 1; fi

# --flag=value form is accepted too.
( parse_args --backend-url=http://h:8000 --boot-dir="$tmp"; validate_args ) \
    || { echo "FAIL: --flag=value form rejected"; exit 1; }

# Malformed signing key => reject at bake time, not on the Pi.
if ( parse_args --backend-url http://h:8000 --boot-dir "$tmp" --signing-key nothex; validate_args ) 2>/dev/null; then
    echo "FAIL: malformed signing key accepted"; exit 1; fi

# The GitHub source flags are gone: everything now comes from the Calvin server.
if ( parse_args --backend-url http://h:8000 --boot-dir "$tmp" --git-branch develop ) 2>/dev/null; then
    echo "FAIL: retired --git-branch still accepted"; exit 1; fi

echo "PASS"
