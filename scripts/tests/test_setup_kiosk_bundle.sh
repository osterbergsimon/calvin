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
