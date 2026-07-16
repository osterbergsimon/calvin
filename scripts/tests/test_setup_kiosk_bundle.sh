#!/usr/bin/env bash
set -euo pipefail
here="$(dirname "$0")"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"
export MARKER="$tmp/bootstrapped"

# Stub updater the shim will fetch + run. On --bootstrap it records the backend url.
cat > "$tmp/updater.sh" <<'UEOF'
#!/usr/bin/env bash
[ "${1:-}" = "--bootstrap" ] && { echo "BOOTSTRAPPED $CALVIN_BACKEND_URL" > "$MARKER"; exit 0; }
exit 1
UEOF
UPD_SHA="$(sha256sum "$tmp/updater.sh" | cut -d' ' -f1)"
cat > "$tmp/manifest.json" <<EOF
{"version":"setup00000000000","min_python":"3.9","files":[
 {"name":"update-kiosk.sh","sha256":"${UPD_SHA}","mode":"0755","target_path":"/usr/local/bin/update-kiosk.sh","restart_unit":"","enable":false}]}
EOF
sed 's/'"${UPD_SHA}"'/0000000000000000000000000000000000000000000000000000000000000000/' \
    "$tmp/manifest.json" > "$tmp/manifest-bad.json"

cat > "$tmp/bin/curl" <<CEOF
#!/usr/bin/env bash
outfile=""; url=""
args=("\$@"); i=0
while [ \$i -lt \${#args[@]} ]; do
  case "\${args[\$i]}" in
    -o) i=\$((i+1)); outfile="\${args[\$i]}";;
    http*) url="\${args[\$i]}";;
  esac; i=\$((i+1))
done
case "\$url" in
  */agent/manifest)
    body="\$(cat "\${MOCK_MANIFEST}")"
    if [ -n "\$outfile" ]; then printf '%s' "\$body" > "\$outfile"; else printf '%s' "\$body"; fi;;
  */agent/files/update-kiosk.sh)
    if [ -n "\$outfile" ]; then cat "$tmp/updater.sh" > "\$outfile"; else cat "$tmp/updater.sh"; fi;;
  *) exit 22;;
esac
CEOF
chmod +x "$tmp/bin/curl"; export PATH="$tmp/bin:$PATH"

# shellcheck disable=SC1090
. "$here/../setup-common.sh"

# --- Happy path: shim fetches + verifies + runs --bootstrap ---
export MOCK_MANIFEST="$tmp/manifest.json"
bootstrap_kiosk "http://server.local:8000"
grep -q 'BOOTSTRAPPED http://server.local:8000' "$MARKER" || { echo "FAIL: --bootstrap not invoked with backend url"; exit 1; }
echo "PASS bootstrap-shim-runs-updater"

# --- Negative: wrong updater sha in manifest aborts before running it ---
rm -f "$MARKER"
if ( export MOCK_MANIFEST="$tmp/manifest-bad.json"
     . "$here/../setup-common.sh"
     bootstrap_kiosk "http://server.local:8000" ) 2>/dev/null; then
  echo "FAIL: bootstrap_kiosk should reject a bad updater checksum"; exit 1
fi
[ ! -f "$MARKER" ] || { echo "FAIL: updater ran despite checksum mismatch"; exit 1; }
echo "PASS bootstrap-shim-rejects-bad-sha"

# ===== manifest signature verification in bootstrap (calvin-5vw) =====
SIG_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
export CALVIN_KIOSK_SIGNING_ENV_FILE="$tmp/signing.env"

# install_signing_key writes a 0600 file with the key
install_signing_key "$SIG_KEY"
grep -q "CALVIN_KIOSK_SIGNING_KEY=$SIG_KEY" "$tmp/signing.env" || { echo "FAIL: signing key not written"; exit 1; }
[ "$(stat -c '%a' "$tmp/signing.env")" = "600" ] || { echo "FAIL: signing file not 0600"; exit 1; }
echo "PASS install-signing-key-0600"

# Build a SIGNED manifest (update-kiosk.sh entry) served by the mock curl.
cat > "$tmp/updater.sh" <<'UEOF'
#!/usr/bin/env bash
[ "${1:-}" = "--bootstrap" ] && { echo "BOOTSTRAPPED $CALVIN_BACKEND_URL" > "$MARKER"; exit 0; }
exit 1
UEOF
UPD_SHA="$(sha256sum "$tmp/updater.sh" | cut -d' ' -f1)"
cat > "$tmp/manifest-unsigned.json" <<EOF
{"version":"setupsig00000000","min_python":"3.9","files":[
 {"name":"update-kiosk.sh","sha256":"${UPD_SHA}","mode":"0755","target_path":"/usr/local/bin/update-kiosk.sh","restart_unit":"","enable":false}]}
EOF
sign_manifest_file() {  # $1 in -> $2 out, signed with SIG_KEY
  CALVIN_KIOSK_SIGNING_KEY="$SIG_KEY" python3 - "$1" "$2" <<'PY'
import sys, json, hmac, hashlib, os
m = json.load(open(sys.argv[1]))
key = bytes.fromhex(os.environ["CALVIN_KIOSK_SIGNING_KEY"])
canon = json.dumps(m, sort_keys=True, separators=(",", ":")).encode()
m["signature"] = hmac.new(key, canon, hashlib.sha256).hexdigest(); m["sig_alg"] = "hmac-sha256"
json.dump(m, open(sys.argv[2], "w"))
PY
}
sign_manifest_file "$tmp/manifest-unsigned.json" "$tmp/manifest-signed.json"

# Mock curl serving the SIGNED manifest + the updater bytes verbatim.
cat > "$tmp/bin/curl" <<CEOF
#!/usr/bin/env bash
outfile=""; url=""
args=("\$@"); i=0
while [ \$i -lt \${#args[@]} ]; do
  case "\${args[\$i]}" in
    -o) i=\$((i+1)); outfile="\${args[\$i]}";;
    http*) url="\${args[\$i]}";;
  esac; i=\$((i+1))
done
case "\$url" in
  */agent/manifest) [ -n "\$outfile" ] && cat "\${MOCK_SIGNED}" > "\$outfile" || cat "\${MOCK_SIGNED}";;
  */agent/files/update-kiosk.sh) [ -n "\$outfile" ] && cat "$tmp/updater.sh" > "\$outfile" || cat "$tmp/updater.sh";;
  *) exit 22;;
esac
CEOF
chmod +x "$tmp/bin/curl"

# --- valid signature -> bootstrap verifies + runs updater ---
rm -f "$MARKER"
export MOCK_SIGNED="$tmp/manifest-signed.json"
bootstrap_kiosk "http://server.local:8000"
grep -q 'BOOTSTRAPPED' "$MARKER" || { echo "FAIL: valid-signature bootstrap did not run updater"; exit 1; }
echo "PASS bootstrap-valid-signature-runs"

# --- tampered signed manifest -> abort, updater never runs ---
rm -f "$MARKER"
cp "$tmp/manifest-signed.json" "$tmp/manifest-bad.json"
sed -i 's/setupsig00000000/TAMPERED00000000/' "$tmp/manifest-bad.json"
if ( export MOCK_SIGNED="$tmp/manifest-bad.json"
     . "$here/../setup-common.sh"
     bootstrap_kiosk "http://server.local:8000" ) 2>/dev/null; then
  echo "FAIL: bootstrap should reject a bad manifest signature"; exit 1; fi
[ ! -f "$MARKER" ] || { echo "FAIL: updater ran despite bad signature"; exit 1; }
echo "PASS bootstrap-bad-signature-aborts"
