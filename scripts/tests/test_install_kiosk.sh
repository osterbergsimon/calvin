#!/usr/bin/env bash
# Verifies the one-command kiosk installer (deploy/kiosk-agent/install-kiosk.sh,
# served by the backend as GET /api/kiosks/install.sh): it fetches the setup
# scripts from the server, verifies them against the (optionally signed) manifest,
# runs setup-kiosk.sh with the server URL, and reboots.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
INSTALLER="$here/../../deploy/kiosk-agent/install-kiosk.sh"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/srv"

SIG_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

# Stub setup scripts the "server" serves. setup-kiosk.sh records how it was run and
# proves setup-common.sh was downloaded next to it.
cat > "$tmp/srv/setup-kiosk.sh" <<'EOF'
#!/bin/bash
[ -f "$(dirname "$0")/setup-common.sh" ] || { echo "no setup-common.sh beside me" >&2; exit 1; }
# Run from its own dir, so setup-kiosk.sh's ./setup-common.sh lookup finds the verified copy.
[ "$(pwd -P)" = "$(cd "$(dirname "$0")" && pwd -P)" ] || { echo "not run from its own dir" >&2; exit 1; }
# Like a dpkg/debconf prompt: anything read here would be eaten from a piped installer.
if IFS= read -r -t 2 stolen; then echo "STOLE $stolen" >> "$RUN_LOG"; fi
echo "SETUP $*" >> "$RUN_LOG"
EOF
echo '# common' > "$tmp/srv/setup-common.sh"

write_manifest() {  # $1 out file; $2 optional key to sign with; $3 optional bad sha
  local kiosk_sha common_sha
  kiosk_sha="${3:-$(sha256sum "$tmp/srv/setup-kiosk.sh" | cut -d' ' -f1)}"
  common_sha="$(sha256sum "$tmp/srv/setup-common.sh" | cut -d' ' -f1)"
  KEY="${2:-}" KSHA="$kiosk_sha" CSHA="$common_sha" python3 - "$1" <<'PY'
import hashlib, hmac, json, os, sys
m = {"version": "v1", "min_python": "3.9", "files": [],
     "installer": [{"name": "setup-kiosk.sh", "sha256": os.environ["KSHA"]},
                   {"name": "setup-common.sh", "sha256": os.environ["CSHA"]}]}
if os.environ["KEY"]:
    canon = json.dumps(m, sort_keys=True, separators=(",", ":")).encode()
    m["signature"] = hmac.new(bytes.fromhex(os.environ["KEY"]), canon, hashlib.sha256).hexdigest()
    m["sig_alg"] = "hmac-sha256"
json.dump(m, open(sys.argv[1], "w"))
PY
}

# Mock curl: serves $MOCK_MANIFEST and the installer files; logs every URL.
cat > "$tmp/bin/curl" <<EOF
#!/usr/bin/env bash
out=""; url=""
while [ "\$#" -gt 0 ]; do
  case "\$1" in -o) out="\$2"; shift ;; http*) url="\$1" ;; esac; shift
done
echo "\$url" >> "$tmp/curl.log"
case "\$url" in
  */api/kiosks/agent/manifest) src="\$MOCK_MANIFEST" ;;
  */api/kiosks/installer/setup-kiosk.sh) src="$tmp/srv/setup-kiosk.sh" ;;
  */api/kiosks/installer/setup-common.sh) src="$tmp/srv/setup-common.sh" ;;
  *) exit 22 ;;
esac
if [ -n "\$out" ]; then cat "\$src" > "\$out"; else cat "\$src"; fi
EOF
cat > "$tmp/bin/systemctl" <<EOF
#!/usr/bin/env bash
echo "systemctl \$*" >> "$tmp/systemctl.log"
EOF
cat > "$tmp/bin/id" <<'EOF'
#!/usr/bin/env bash
[ "${1:-}" = "-u" ] && { echo "${MOCK_UID:-0}"; exit 0; }
exit 1
EOF
chmod +x "$tmp/bin/"*
export PATH="$tmp/bin:$PATH"
export RUN_LOG="$tmp/run.log"
export CALVIN_KIOSK_SIGNING_ENV_FILE="$tmp/signing.env"
export CALVIN_INSTALL_REBOOT_DELAY=0

# A copy of the installer with the server URL baked in, as the backend serves it.
sed "s|@CALVIN_SERVER_URL@|http://tower.local:8000|" "$INSTALLER" > "$tmp/served.sh"

reset() { rm -f "$tmp/run.log" "$tmp/systemctl.log" "$tmp/curl.log" "$tmp/signing.env"; }

# --- 1. Unsigned happy path: setup runs against the baked URL, then reboot. ---
write_manifest "$tmp/manifest.json"
export MOCK_MANIFEST="$tmp/manifest.json"
reset
bash "$tmp/served.sh" >/dev/null
grep -qx 'SETUP --backend-url http://tower.local:8000' "$RUN_LOG" \
    || { echo "FAIL: setup-kiosk.sh not run with baked url"; cat "$RUN_LOG"; exit 1; }
grep -q '^http://tower.local:8000/api/kiosks/installer/setup-common.sh$' "$tmp/curl.log" \
    || { echo "FAIL: setup-common.sh not fetched from the server"; exit 1; }
grep -qw 'reboot' "$tmp/systemctl.log" || { echo "FAIL: no reboot"; exit 1; }
echo "PASS install-unsigned-runs-setup-and-reboots"

# --- 1b. Piped like `curl | sudo bash`: children cannot eat the script from stdin
#     (guarded twice: the main() wrapper and setup-kiosk.sh </dev/null). ---
reset
cat "$tmp/served.sh" | bash -s >/dev/null  # a real pipe, like curl | bash
if grep -q STOLE "$RUN_LOG"; then echo "FAIL: setup read the piped installer from stdin"; exit 1; fi
grep -qw 'reboot' "$tmp/systemctl.log" || { echo "FAIL: piped install did not reach the reboot"; exit 1; }
echo "PASS install-piped-stdin-isolated"

# --- 1c. A truncated download runs nothing (the body is one function called last). ---
reset
head -c "$(( $(wc -c < "$tmp/served.sh") * 2 / 3 ))" "$tmp/served.sh" | bash -s >/dev/null 2>&1 || true
[ ! -f "$RUN_LOG" ] && [ ! -f "$tmp/systemctl.log" ] || { echo "FAIL: a truncated installer ran"; exit 1; }
echo "PASS install-truncated-runs-nothing"

# --- 1d. A flag missing its value fails with a message. ---
if err="$(bash "$tmp/served.sh" --backend-url 2>&1)"; then echo "FAIL: missing value accepted"; exit 1; fi
echo "$err" | grep -q 'needs a value' || { echo "FAIL: unclear error: $err"; exit 1; }
echo "PASS install-missing-value"

# --- 2. --no-reboot skips the reboot. ---
reset
bash "$tmp/served.sh" --no-reboot >/dev/null
[ ! -f "$tmp/systemctl.log" ] || { echo "FAIL: rebooted despite --no-reboot"; exit 1; }
echo "PASS install-no-reboot"

# --- 3. Not root => refuse before doing anything. ---
reset
if MOCK_UID=1000 bash "$tmp/served.sh" 2>/dev/null; then echo "FAIL: ran as non-root"; exit 1; fi
[ ! -f "$RUN_LOG" ] || { echo "FAIL: setup ran as non-root"; exit 1; }
echo "PASS install-requires-root"

# --- 4. Unbaked template (run from a checkout / baked card) needs --backend-url. ---
reset
if bash "$INSTALLER" --no-reboot 2>/dev/null; then echo "FAIL: ran without a server url"; exit 1; fi
bash "$INSTALLER" --no-reboot --backend-url http://10.0.0.5:8000/ >/dev/null
grep -qx 'SETUP --backend-url http://10.0.0.5:8000' "$RUN_LOG" \
    || { echo "FAIL: --backend-url not honored"; cat "$RUN_LOG"; exit 1; }
echo "PASS install-template-needs-backend-url"

# --- 5. Installer file hash mismatch => abort, setup never runs. ---
write_manifest "$tmp/manifest-badsha.json" "" "$(printf '0%.0s' {1..64})"
reset
if MOCK_MANIFEST="$tmp/manifest-badsha.json" bash "$tmp/served.sh" --no-reboot 2>/dev/null; then
    echo "FAIL: accepted a setup script with the wrong hash"; exit 1; fi
[ ! -f "$RUN_LOG" ] || { echo "FAIL: setup ran despite hash mismatch"; exit 1; }
echo "PASS install-rejects-bad-hash"

# --- 6. Server too old (manifest has no installer hashes) => clear failure. ---
echo '{"version":"v0","min_python":"3.9","files":[]}' > "$tmp/manifest-old.json"
reset
if err="$(MOCK_MANIFEST="$tmp/manifest-old.json" bash "$tmp/served.sh" --no-reboot 2>&1)"; then
    echo "FAIL: accepted a manifest without installer hashes"; exit 1; fi
echo "$err" | grep -qi 'installer' || { echo "FAIL: unclear error: $err"; exit 1; }
echo "PASS install-old-server-clear-error"

# --- 7. Signing key file: written 0600 before setup, signed manifest verified. ---
write_manifest "$tmp/manifest-signed.json" "$SIG_KEY"
echo "$SIG_KEY" > "$tmp/key.hex"
reset
MOCK_MANIFEST="$tmp/manifest-signed.json" bash "$tmp/served.sh" --no-reboot \
    --signing-key-file "$tmp/key.hex" >/dev/null
grep -qx "CALVIN_KIOSK_SIGNING_KEY=$SIG_KEY" "$tmp/signing.env" || { echo "FAIL: key not written"; exit 1; }
[ "$(stat -c '%a' "$tmp/signing.env")" = "600" ] || { echo "FAIL: key file not 0600"; exit 1; }
grep -q 'SETUP' "$RUN_LOG" || { echo "FAIL: signed install did not run setup"; exit 1; }
if grep -q "$SIG_KEY" "$RUN_LOG"; then echo "FAIL: key leaked onto setup command line"; exit 1; fi
echo "PASS install-signed-key-file"

# --- 8. Key given but manifest unsigned (stripped by a MITM) => fail closed. ---
reset
if MOCK_MANIFEST="$tmp/manifest.json" bash "$tmp/served.sh" --no-reboot \
    --signing-key "$SIG_KEY" 2>/dev/null; then
    echo "FAIL: unsigned manifest accepted with a key"; exit 1; fi
[ ! -f "$RUN_LOG" ] || { echo "FAIL: setup ran with unsigned manifest"; exit 1; }
[ ! -f "$tmp/signing.env" ] || { echo "FAIL: unverified key was stored"; exit 1; }
echo "PASS install-signed-rejects-unsigned"

# --- 9. Key signed by someone else => fail closed. ---
write_manifest "$tmp/manifest-otherkey.json" "$(printf 'f%.0s' {1..64})"
reset
if MOCK_MANIFEST="$tmp/manifest-otherkey.json" bash "$tmp/served.sh" --no-reboot \
    --signing-key "$SIG_KEY" 2>/dev/null; then
    echo "FAIL: wrong-key signature accepted"; exit 1; fi
[ ! -f "$RUN_LOG" ] || { echo "FAIL: setup ran with forged manifest"; exit 1; }
[ ! -f "$tmp/signing.env" ] || { echo "FAIL: key that failed verification was stored"; exit 1; }
echo "PASS install-signed-rejects-forgery"

# --- 10. A key already on the device (baked card) is used without a flag. ---
reset
printf 'CALVIN_KIOSK_SIGNING_KEY=%s\n' "$SIG_KEY" > "$tmp/signing.env"
if MOCK_MANIFEST="$tmp/manifest.json" bash "$tmp/served.sh" --no-reboot 2>/dev/null; then
    echo "FAIL: pre-seeded key ignored"; exit 1; fi
MOCK_MANIFEST="$tmp/manifest-signed.json" bash "$tmp/served.sh" --no-reboot >/dev/null
echo "PASS install-uses-preseeded-key"

# --- 11. Malformed key => refuse before writing anything. ---
reset
if bash "$tmp/served.sh" --no-reboot --signing-key 'nothex' 2>/dev/null; then
    echo "FAIL: malformed key accepted"; exit 1; fi
[ ! -f "$tmp/signing.env" ] || { echo "FAIL: malformed key written"; exit 1; }
echo "PASS install-rejects-malformed-key"

echo "PASS"
