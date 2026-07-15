#!/usr/bin/env bash
set -euo pipefail
here="$(dirname "$0")"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/dest" "$tmp/state"

# The agent body that the mock curl will serve
AGENT_BODY="AGENT-BODY"

# Compute the REAL sha256 of the bytes the mock curl will serve.
# The mock uses: printf '%s\n' "$AGENT_BODY" > outfile  (adds a newline)
AGENT_SHA="$(printf '%s\n' "$AGENT_BODY" | sha256sum | cut -d' ' -f1)"

# Mock manifest: sha256 matches what curl will serve
cat > "$tmp/manifest.json" <<EOF
{"version":"feedfacefeedface","min_python":"3.9","files":[
 {"name":"calvin_display_agent.py","sha256":"${AGENT_SHA}","mode":"0755","target_path":"$tmp/dest/agent.py","restart_unit":"calvin-display-agent.service"}]}
EOF

# Mock manifest with WRONG sha256 for the negative/checksum-mismatch test
BAD_SHA="0000000000000000000000000000000000000000000000000000000000000000"
cat > "$tmp/manifest-bad-sha.json" <<EOF
{"version":"feedfacefeedface","min_python":"3.9","files":[
 {"name":"calvin_display_agent.py","sha256":"${BAD_SHA}","mode":"0755","target_path":"$tmp/dest/agent.py","restart_unit":"calvin-display-agent.service"}]}
EOF

# State variable to let the mock curl switch manifests
MANIFEST_FILE="$tmp/manifest.json"

cat > "$tmp/bin/curl" <<'CURL_EOF'
#!/usr/bin/env bash
# Parse -o <file> flag if present
outfile=""
url=""
args=("$@")
i=0
while [ $i -lt ${#args[@]} ]; do
    case "${args[$i]}" in
        -o) i=$((i+1)); outfile="${args[$i]}";;
        -o*) outfile="${args[$i]#-o}";;
        http*) url="${args[$i]}";;
    esac
    i=$((i+1))
done
emit() {
    if [ -n "$outfile" ]; then printf '%s\n' "$1" > "$outfile"; else printf '%s\n' "$1"; fi
}
case "$url" in
  */agent/manifest) cat "${MOCK_MANIFEST_FILE}"; exit 0;;
  */agent/files/calvin_display_agent.py) emit "AGENT-BODY"; exit 0;;
esac
exit 22
CURL_EOF
chmod +x "$tmp/bin/curl"; export PATH="$tmp/bin:$PATH"

# shellcheck disable=SC1090
. "$here/../setup-common.sh"
export CALVIN_AGENT_STATE_DIR="$tmp/state"

# --- Happy path: correct sha256 ---
export MOCK_MANIFEST_FILE="$tmp/manifest.json"
install_kiosk_bundle "http://server.local:8000" "$(id -un)"

grep -q AGENT-BODY "$tmp/dest/agent.py" || { echo "FAIL: agent not installed from bundle"; exit 1; }
grep -q feedfacefeedface "$tmp/state/agent-version.json" || { echo "FAIL: version not seeded"; exit 1; }
echo "PASS happy-path (agent installed + version seeded + checksum verified)"

# --- Negative: wrong sha256 in manifest should cause install_kiosk_bundle to fail ---
rm -f "$tmp/dest/agent.py" "$tmp/state/agent-version.json"
export MOCK_MANIFEST_FILE="$tmp/manifest-bad-sha.json"
# Run in a subshell so that error_exit's `exit` doesn't terminate the test runner
if ( export MOCK_MANIFEST_FILE="$tmp/manifest-bad-sha.json"
     . "$here/../setup-common.sh"
     export CALVIN_AGENT_STATE_DIR="$tmp/state"
     install_kiosk_bundle "http://server.local:8000" "$(id -un)" ) 2>/dev/null; then
    echo "FAIL: install_kiosk_bundle should have failed on checksum mismatch but succeeded"
    exit 1
fi
echo "PASS checksum-mismatch negative (install correctly rejected bad sha256)"
