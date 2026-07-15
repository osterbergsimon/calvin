#!/usr/bin/env bash
# Verifies install_authorized_key() appends a key once, idempotently.
set -euo pipefail

# shellcheck disable=SC1090
source "$(dirname "$0")/../setup-common.sh"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
export CALVIN_HOME_OVERRIDE="$tmp"
mkdir -p "$tmp/tester"

KEY="ssh-ed25519 AAAAC3NzaC1lZDI1 test@host"

# Empty key is a no-op (no file created).
install_authorized_key tester ""
[ ! -e "$tmp/tester/.ssh/authorized_keys" ] || { echo "FAIL: empty key wrote a file"; exit 1; }

# First install writes the key with 0600.
install_authorized_key tester "$KEY"
grep -qF "$KEY" "$tmp/tester/.ssh/authorized_keys" || { echo "FAIL: key not written"; exit 1; }
perms="$(stat -c '%a' "$tmp/tester/.ssh/authorized_keys")"
[ "$perms" = "600" ] || { echo "FAIL: bad perms: $perms"; exit 1; }

# Second install is idempotent (no duplicate line).
install_authorized_key tester "$KEY"
count="$(grep -cF "$KEY" "$tmp/tester/.ssh/authorized_keys")"
[ "$count" = "1" ] || { echo "FAIL: duplicated key ($count)"; exit 1; }

echo "PASS"
