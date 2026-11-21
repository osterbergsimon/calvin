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
if ! command -v read_env_value >/dev/null 2>&1; then
    # Read KEY's value (empty if missing), like setup-common.sh.
    read_env_value() {
        local file="$1" key="$2"
        [ -f "$file" ] || return 0
        grep "^${key}=" "$file" 2>/dev/null | tail -n 1 | cut -d= -f2- | tr -d "\"'" || true
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

# --- --pair-code hands the one-time code to the agent (calvin-0xns) ----------
PAIR_CODE="clv_pair_$(printf 'b%.0s' {1..22})"
agent_dir="$TMPDIR_TEST/agent"
mkdir -p "$agent_dir"
export CALVIN_AGENT_STATE_DIR="$agent_dir"
export CALVIN_USER=calvin
chown() { printf '%s\n' "chown $*" >> "$TMPDIR_TEST/chown.log"; }

install_pair_code "$PAIR_CODE"
pair_file="$agent_dir/install-pair-code"
[ "$(cat "$pair_file")" = "$PAIR_CODE" ] \
    || { echo "FAIL: install-pair-code content is wrong"; exit 1; }
[ "$(stat -c '%a' "$pair_file")" = "600" ] \
    || { echo "FAIL: install-pair-code is not 0600"; exit 1; }
grep -q "calvin:calvin $agent_dir/install-pair-code.tmp" "$TMPDIR_TEST/chown.log" \
    || { echo "FAIL: install-pair-code temp file is not owned by calvin"; exit 1; }
grep -q "chown -h calvin:calvin $agent_dir/install-pair-code.tmp" "$TMPDIR_TEST/chown.log" \
    || { echo "FAIL: install-pair-code chown does not use -h"; exit 1; }
echo "PASS: setup-kiosk.sh writes install-pair-code 0600 for calvin"

# A symlink left at the temp path is refused: root must never write through a
# path the calvin-writable state dir lets calvin swap (review m4).
sym_dir="$TMPDIR_TEST/agent-symlink"
mkdir -p "$sym_dir"
victim="$TMPDIR_TEST/symlink-victim"
echo keep > "$victim"
ln -s "$victim" "$sym_dir/install-pair-code.tmp"
if ( CALVIN_AGENT_STATE_DIR="$sym_dir"; install_pair_code "$PAIR_CODE" ) 2>/dev/null; then
    echo "FAIL: install_pair_code wrote through a symlink"; exit 1; fi
[ "$(cat "$victim")" = keep ] \
    || { echo "FAIL: the symlink target was clobbered"; exit 1; }
[ ! -e "$sym_dir/install-pair-code" ] \
    || { echo "FAIL: a code was written despite the symlink"; exit 1; }
echo "PASS: setup-kiosk.sh refuses a symlinked install-pair-code.tmp"

# A malformed code is refused before anything is written.
bad_dir="$TMPDIR_TEST/agent-bad"
mkdir -p "$bad_dir"
if ( CALVIN_AGENT_STATE_DIR="$bad_dir"; install_pair_code 'clv_pair_short' ) 2>/dev/null; then
    echo "FAIL: install_pair_code accepted a malformed code"; exit 1; fi
[ ! -e "$bad_dir/install-pair-code" ] \
    || { echo "FAIL: a malformed pair code wrote install-pair-code"; exit 1; }
echo "PASS: setup-kiosk.sh refuses a malformed pair code"

# parse_args rejects a malformed --pair-code and accepts a valid one.
if ( parse_args --backend-url http://h:8000 --pair-code 'clv_pair_short' ) 2>/dev/null; then
    echo "FAIL: --pair-code accepted a malformed code"; exit 1; fi
( parse_args --backend-url http://h:8000 --pair-code "$PAIR_CODE" ) \
    || { echo "FAIL: --pair-code rejected a valid code"; exit 1; }
echo "PASS: setup-kiosk.sh validates --pair-code"

# The whole string is checked: grep used to accept any single matching line, so
# a multi-line value (shell injection in the baked installer) got through m5.
MULTILINE=$'x; echo pwned\n'"clv_pair_$(printf 'b%.0s' {1..22})"
multi_dir="$TMPDIR_TEST/agent-multi"
mkdir -p "$multi_dir"
if ( CALVIN_AGENT_STATE_DIR="$multi_dir"; install_pair_code "$MULTILINE" ) 2>/dev/null; then
    echo "FAIL: install_pair_code accepted a multi-line code"; exit 1; fi
[ ! -e "$multi_dir/install-pair-code" ] \
    || { echo "FAIL: a multi-line pair code was written"; exit 1; }
echo "PASS: setup-kiosk.sh refuses a multi-line pair code"
if ( parse_args --backend-url http://h:8000 --pair-code "$MULTILINE" ) 2>/dev/null; then
    echo "FAIL: --pair-code accepted a multi-line code"; exit 1; fi
echo "PASS: setup-kiosk.sh validates --pair-code as a whole string"

# The code is written only after bootstrap_kiosk created the agent's dir. main()
# is defined after setup-kiosk.sh's source-only return, so pin the call order in
# the file: bootstrap first, then install_pair_code.
setup_src="$(dirname "$0")/../setup-kiosk.sh"
# shellcheck disable=SC2016  # the patterns are literal source text
bootstrap_line="$(grep -n 'bootstrap_kiosk "${BACKEND_URL}"' "$setup_src" | cut -d: -f1)"
# shellcheck disable=SC2016
pair_line="$(grep -n 'install_pair_code "${PAIR_CODE}"' "$setup_src" | cut -d: -f1)"
[ -n "$bootstrap_line" ] && [ -n "$pair_line" ] \
    || { echo "FAIL: the setup-kiosk bootstrap/pair-code calls are missing"; exit 1; }
[ "$pair_line" -gt "$bootstrap_line" ] \
    || { echo "FAIL: install-pair-code is written before bootstrap_kiosk"; exit 1; }
echo "PASS: setup-kiosk.sh writes install-pair-code after bootstrap_kiosk"
