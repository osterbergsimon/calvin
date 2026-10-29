#!/usr/bin/env bash
# Regression test: the /etc/default/calvin-kiosk that firstrun seeds must be
# sourceable by bash under `set -e` (the boot-2 wrapper and the updater source
# it). An unquoted SSH public key ("ssh-ed25519 AAAA... user") used to make the
# wrapper die with "command not found" before provisioning. The key now goes to
# the admin user at boot 1 and is not written to this file at all.
set -euo pipefail

# shellcheck source=../bake-kiosk-firstrun.sh
source "$(dirname "$0")/../bake-kiosk-firstrun.sh" --source-only 2>/dev/null || true

tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
PUBKEY="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJXs1dE4zJrLBbRjwPl6xuakR4ZGoU1cwgaeaXqM8VrU me@laptop"
echo "$PUBKEY" > "$tmp/id.pub"

parse_args --backend-url http://h:8000 --boot-dir /tmp --ssh-pubkey "$tmp/id.pub"
generated="$(emit_firstrun)"

# Run just the baked assignments + step 4 (config seeding) against a temp ENV_FILE.
{
    echo "set -euo pipefail"
    echo "${generated}" | grep -E '^(BACKEND_URL|SSH_PUBKEY)='
    echo "ENV_FILE='$tmp/calvin-kiosk'"
    echo "${generated}" | sed -n '/^# 4\. Seed/,/^# 4b\./p'
} > "$tmp/step4.sh"
bash "$tmp/step4.sh"

got="$(bash -c 'set -euo pipefail; . "$1"; printf "%s" "$CALVIN_BACKEND_URL"' _ "$tmp/calvin-kiosk")" \
    || { echo "FAIL: seeded env file is not sourceable:"; cat "$tmp/calvin-kiosk"; exit 1; }
[ "$got" = "http://h:8000" ] || { echo "FAIL: round-trip mismatch: $got"; exit 1; }
if grep -q 'SSH_PUBKEY\|AAAAC3' "$tmp/calvin-kiosk"; then
    echo "FAIL: the public key is still seeded into the env file"; exit 1; fi

# A key with a single quote can't be safely quoted for both bash and systemd: reject at bake time.
echo "ssh-ed25519 AAAA it's-me" > "$tmp/bad.pub"
touch "$tmp/cmdline.txt"
if ( parse_args --backend-url http://h:8000 --boot-dir "$tmp" --ssh-pubkey "$tmp/bad.pub"; validate_args ) 2>/dev/null; then
    echo "FAIL: pubkey with a single quote accepted"; exit 1; fi

echo "PASS"
