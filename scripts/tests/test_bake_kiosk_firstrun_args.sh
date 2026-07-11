#!/usr/bin/env bash
# Verifies bake-kiosk-firstrun.sh argument validation and URL derivation.
set -euo pipefail

# shellcheck disable=SC1090
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

# URL derivation from a .git repo.
got="$(derive_raw_setup_url https://github.com/osterbergsimon/calvin.git develop)"
want="https://raw.githubusercontent.com/osterbergsimon/calvin/develop/scripts/setup-kiosk.sh"
[ "$got" = "$want" ] || { echo "FAIL: bad raw url: $got"; exit 1; }

echo "PASS"
