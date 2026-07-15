#!/usr/bin/env bash
set -euo pipefail
here="$(dirname "$0")"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/dest" "$tmp/state"

# Mock manifest + one file via a mock curl
cat > "$tmp/manifest.json" <<EOF
{"version":"feedfacefeedface","min_python":"3.9","files":[
 {"name":"calvin_display_agent.py","sha256":"x","mode":"0755","target_path":"$tmp/dest/agent.py","restart_unit":"calvin-display-agent.service"}]}
EOF
cat > "$tmp/bin/curl" <<EOF
#!/usr/bin/env bash
# Parse -o <file> flag if present
outfile=""
url=""
args=("\$@")
i=0
while [ \$i -lt \${#args[@]} ]; do
    case "\${args[\$i]}" in
        -o) i=\$((i+1)); outfile="\${args[\$i]}";;
        -o*) outfile="\${args[\$i]#-o}";;
        http*) url="\${args[\$i]}";;
    esac
    i=\$((i+1))
done
emit() {
    if [ -n "\$outfile" ]; then printf '%s\n' "\$1" > "\$outfile"; else printf '%s\n' "\$1"; fi
}
case "\$url" in
  */agent/manifest) emit '$(cat "$tmp/manifest.json")'; exit 0;;
  */agent/files/calvin_display_agent.py) emit "AGENT-BODY"; exit 0;;
esac
exit 22
EOF
chmod +x "$tmp/bin/curl"; export PATH="$tmp/bin:$PATH"

# shellcheck disable=SC1090
. "$here/../setup-common.sh"
export CALVIN_AGENT_STATE_DIR="$tmp/state"
install_kiosk_bundle "http://server.local:8000" "$(id -un)"

grep -q AGENT-BODY "$tmp/dest/agent.py" || { echo "FAIL: agent not installed from bundle"; exit 1; }
grep -q feedfacefeedface "$tmp/state/agent-version.json" || { echo "FAIL: version not seeded"; exit 1; }
echo "PASS"
