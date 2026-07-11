#!/usr/bin/env bash
# Regression test: operator-set CALVIN_KIOSK_ID must survive re-running install_kiosk_config().
#
# Covers the Critical bug where `install -m 0644 /dev/null <env_file>` truncated
# the file before the grep guard ran, so the guard was always false and the id
# was always regenerated.
set -euo pipefail

# Create an isolated temp file for the env config so this test never needs root.
TMPDIR_TEST="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_TEST"' EXIT

env_file="$TMPDIR_TEST/calvin-kiosk"

# Pre-populate the env file with an operator-set kiosk id and hostname.
printf 'CALVIN_KIOSK_ID=kitchen\nCALVIN_KIOSK_HOSTNAME=pi-operator\n' > "$env_file"

# Export env overrides so they are visible inside install_kiosk_config() when called.
export CALVIN_KIOSK_ENV_FILE="$env_file"
export BACKEND_URL="http://homeserver.local:8000"

# Source only the functions under test.
# shellcheck disable=SC1090
source "$(dirname "$0")/../setup-kiosk.sh" --source-only 2>/dev/null || true

# Provide stub for helpers that are defined in setup-common.sh (not available
# in unit-test context).  Only stub what install_kiosk_config calls.
if ! command -v log >/dev/null 2>&1; then
    log() { :; }
fi
if ! command -v upsert_env_value >/dev/null 2>&1; then
    # Minimal upsert: set KEY=VALUE in the file, replacing any existing line.
    upsert_env_value() {
        local file="$1" key="$2" value="$3"
        if grep -q "^${key}=" "$file" 2>/dev/null; then
            # Replace existing
            sed -i "s|^${key}=.*|${key}=${value}|" "$file"
        else
            printf '%s=%s\n' "$key" "$value" >> "$file"
        fi
    }
fi

# Call the function under test.
install_kiosk_config

# Assert: the operator-set id was preserved.
actual_id="$(grep '^CALVIN_KIOSK_ID=' "$env_file" | cut -d= -f2-)"
if [ "$actual_id" = "kitchen" ]; then
    echo "PASS: CALVIN_KIOSK_ID=kitchen was preserved"
else
    echo "FAIL: expected CALVIN_KIOSK_ID=kitchen, got CALVIN_KIOSK_ID=${actual_id}"
    exit 1
fi

# Assert: the operator-set hostname was preserved across re-run.
actual_host="$(grep '^CALVIN_KIOSK_HOSTNAME=' "$env_file" | cut -d= -f2-)"
if [ "$actual_host" = "pi-operator" ]; then
    echo "PASS: CALVIN_KIOSK_HOSTNAME=pi-operator was preserved"
else
    echo "FAIL: expected CALVIN_KIOSK_HOSTNAME=pi-operator, got CALVIN_KIOSK_HOSTNAME=${actual_host}"
    exit 1
fi
