#!/usr/bin/env bash
# Verifies main() writes firstrun.sh and appends the cmdline hook exactly once.
set -euo pipefail

# shellcheck disable=SC1090
source "$(dirname "$0")/../bake-kiosk-firstrun.sh" --source-only 2>/dev/null || true

tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
printf 'console=serial0,115200 root=PARTUUID=abcd rootwait\n' > "$tmp/cmdline.txt"

parse_args --backend-url http://homeserver.local:8000 --boot-dir "$tmp" --hostname kitchen
main --backend-url http://homeserver.local:8000 --boot-dir "$tmp" --hostname kitchen

[ -f "$tmp/firstrun.sh" ] || { echo "FAIL: firstrun.sh not written"; exit 1; }
[ -x "$tmp/firstrun.sh" ] || { echo "FAIL: firstrun.sh not executable"; exit 1; }
grep -q 'systemd.run=/boot/firmware/firstrun.sh' "$tmp/cmdline.txt" \
    || { echo "FAIL: cmdline hook missing"; exit 1; }
# cmdline.txt must stay a single line.
[ "$(wc -l < "$tmp/cmdline.txt")" -le 1 ] || { echo "FAIL: cmdline became multiline"; exit 1; }

# Re-run must not duplicate the hook.
main --backend-url http://homeserver.local:8000 --boot-dir "$tmp" --hostname kitchen
n="$(grep -o 'systemd.run=/boot/firmware/firstrun.sh' "$tmp/cmdline.txt" | wc -l)"
[ "$n" = "1" ] || { echo "FAIL: hook duplicated ($n)"; exit 1; }

echo "PASS"
