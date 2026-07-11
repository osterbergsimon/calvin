#!/usr/bin/env bash
# Verifies emit_firstrun produces a firstrun.sh with the baked values embedded.
set -euo pipefail

# shellcheck disable=SC1090
source "$(dirname "$0")/../bake-kiosk-firstrun.sh" --source-only 2>/dev/null || true

parse_args \
  --backend-url http://homeserver.local:8000 \
  --boot-dir /tmp --hostname kitchen \
  --wifi-ssid HomeNet --wifi-psk s3cret --wifi-country SE \
  --git-branch develop

out="$(emit_firstrun)"

# Baked values are emitted via printf '%q' — clean values (no shell metacharacters)
# are emitted without quotes.  Verify each value is present in its %q form.
echo "$out" | grep -qF "BACKEND_URL=http://homeserver.local:8000" \
    || { echo "FAIL: backend url not baked"; exit 1; }
echo "$out" | grep -qF "SETUP_KIOSK_URL=https://raw.githubusercontent.com/osterbergsimon/calvin/develop/scripts/setup-kiosk.sh" \
    || { echo "FAIL: setup url not baked"; exit 1; }
echo "$out" | grep -q '/etc/hostname' || { echo "FAIL: hostname not set"; exit 1; }
echo "$out" | grep -qF "CALVIN_HOSTNAME=kitchen" || { echo "FAIL: hostname value missing"; exit 1; }
echo "$out" | grep -qF "WIFI_SSID=HomeNet" || { echo "FAIL: wifi ssid not baked"; exit 1; }
echo "$out" | grep -q 'calvin-kiosk-firstboot.service' || { echo "FAIL: firstboot unit not embedded"; exit 1; }
echo "$out" | grep -q 'calvin-kiosk-firstboot.sh' || { echo "FAIL: firstboot wrapper not embedded"; exit 1; }
echo "$out" | grep -q 'systemd.run' || { echo "FAIL: does not strip its own cmdline hook"; exit 1; }

# Wifi is runtime-guarded, so the block is always present but baked empty when
# no SSID is given.  printf '%q' of an empty string produces ''.
parse_args --backend-url http://h:8000 --boot-dir /tmp
out2="$(emit_firstrun)"
echo "$out2" | grep -qF "WIFI_SSID=''" || { echo "FAIL: empty wifi not baked"; exit 1; }

echo "PASS"
