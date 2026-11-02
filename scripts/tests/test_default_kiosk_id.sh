#!/usr/bin/env bash
# Verifies compute_default_kiosk_id() produces <hostname>-<6 hex> and is stable.
set -euo pipefail

# Source only the function under test from setup-kiosk.sh.
# shellcheck disable=SC1090
source "$(dirname "$0")/../setup-kiosk.sh" --source-only 2>/dev/null || true

id1="$(HOSTNAME_OVERRIDE=raspberrypi MACHINE_ID_OVERRIDE=3f9a2cdeadbeef compute_default_kiosk_id)"
id2="$(HOSTNAME_OVERRIDE=raspberrypi MACHINE_ID_OVERRIDE=3f9a2cdeadbeef compute_default_kiosk_id)"

[ "$id1" = "$id2" ] || { echo "FAIL: not stable ($id1 != $id2)"; exit 1; }
echo "$id1" | grep -qE '^raspberrypi-[0-9a-f]{6}$' || { echo "FAIL: bad format: $id1"; exit 1; }

# Different machine-id => different suffix.
id3="$(HOSTNAME_OVERRIDE=raspberrypi MACHINE_ID_OVERRIDE=b71e04feedface compute_default_kiosk_id)"
[ "$id1" != "$id3" ] || { echo "FAIL: suffix not machine-derived"; exit 1; }

# compute_default_kiosk_hostname returns the (sanitized) Pi hostname.
host1="$(HOSTNAME_OVERRIDE=pi-kitchen compute_default_kiosk_hostname)"
[ "$host1" = "pi-kitchen" ] || { echo "FAIL: bad default hostname: $host1"; exit 1; }

# Odd bytes in the hostname are stripped to the [A-Za-z0-9.-] allowlist so they
# cannot inject weird characters into CALVIN_KIOSK_ID / CALVIN_KIOSK_HOSTNAME.
host2="$(HOSTNAME_OVERRIDE='pi kitchen;rm' compute_default_kiosk_hostname)"
[ "$host2" = "pikitchenrm" ] || { echo "FAIL: hostname not sanitized: $host2"; exit 1; }

# The sanitized hostname flows into the composed kiosk id.
id4="$(HOSTNAME_OVERRIDE='pi kitchen' MACHINE_ID_OVERRIDE=3f9a2cdeadbeef compute_default_kiosk_id)"
echo "$id4" | grep -qE '^pikitchen-[0-9a-f]{6}$' || { echo "FAIL: id not sanitized: $id4"; exit 1; }

echo "PASS"
