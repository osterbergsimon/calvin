#!/usr/bin/env bash
# Drives update-kiosk.sh with mocked curl/systemctl and a temp filesystem.
set -euo pipefail
SCRIPT="$(dirname "$0")/../../deploy/kiosk-agent/update-kiosk.sh"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/state" "$tmp/systemd" "$tmp/local" "$tmp/run"

# --- installed (old) agent + its unit ---
echo 'print("OLD")' > "$tmp/local/calvin_display_agent.py"
echo 'OLD-UNIT'     > "$tmp/systemd/calvin-display-agent.service"

# --- server-side (new) files + manifest, served by mock curl ---
mkdir -p "$tmp/srv"
printf 'import sys\nsys.exit(0)\n' > "$tmp/srv/calvin_display_agent.py"
NEW_AGENT_SHA="$(sha256sum "$tmp/srv/calvin_display_agent.py" | cut -d' ' -f1)"
cat > "$tmp/srv/manifest.json" <<EOF
{"version":"deadbeefdeadbeef","min_python":"3.9","files":[
 {"name":"calvin_display_agent.py","sha256":"$NEW_AGENT_SHA","mode":"0755",
  "target_path":"$tmp/local/calvin_display_agent.py","restart_unit":"calvin-display-agent.service"}]}
EOF

# mock curl: manifest + file fetch
cat > "$tmp/bin/curl" <<EOF
#!/usr/bin/env bash
for a in "\$@"; do case "\$a" in
  */agent/manifest) cat "$tmp/srv/manifest.json"; exit 0;;
  */agent/files/calvin_display_agent.py) cat "$tmp/srv/calvin_display_agent.py"; exit 0;;
esac; done
exit 22
EOF
# mock systemctl: is-active succeeds (healthy) by default; log calls
cat > "$tmp/bin/systemctl" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "$tmp/systemctl.log"
case "\$1 \$2" in "is-active"*|"show"*) exit 0;; esac
exit 0
EOF
chmod +x "$tmp/bin/curl" "$tmp/bin/systemctl"

export CALVIN_BACKEND_URL="http://server.local:8000"
export CALVIN_CURL="$tmp/bin/curl" CALVIN_SYSTEMCTL="$tmp/bin/systemctl"
export CALVIN_AGENT_STATE_DIR="$tmp/state" CALVIN_SYSTEMD_DIR="$tmp/systemd"
export CALVIN_AGENT_READY_MARKER="$tmp/run/agent-ready"
export CALVIN_UPDATE_HEALTH_TIMEOUT=4

# health: mark ready so the health check passes
: > "$CALVIN_AGENT_READY_MARKER"

bash "$SCRIPT"

grep -q 'sys.exit(0)' "$tmp/local/calvin_display_agent.py" || { echo "FAIL: agent not swapped"; exit 1; }
grep -q 'restart calvin-display-agent.service' "$tmp/systemctl.log" || { echo "FAIL: did not restart changed unit"; exit 1; }
grep -q 'deadbeefdeadbeef' "$tmp/state/agent-version.json" || { echo "FAIL: version not recorded"; exit 1; }
echo "PASS happy-path"

# --- python-too-old: manifest demands 3.99 ---
sed 's/"3.9"/"3.99"/' "$tmp/srv/manifest.json" > "$tmp/srv/manifest.json.hi"
mv "$tmp/srv/manifest.json.hi" "$tmp/srv/manifest.json"
echo 'print("OLD")' > "$tmp/local/calvin_display_agent.py"
if bash "$SCRIPT"; then echo "FAIL: should abort on python-too-old"; exit 1; fi
grep -q 'python-too-old' "$tmp/state/agent-update-state.json" || { echo "FAIL: no python-too-old state"; exit 1; }
grep -q 'OLD' "$tmp/local/calvin_display_agent.py" || { echo "FAIL: agent changed despite abort"; exit 1; }
echo "PASS python-too-old"

# --- rollback: is-active fails -> restore backup ---
cat > "$tmp/bin/systemctl" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "$tmp/systemctl.log"
[ "\$1" = "is-active" ] && exit 3   # never healthy
exit 0
EOF
chmod +x "$tmp/bin/systemctl"
sed 's/"3.99"/"3.9"/' "$tmp/srv/manifest.json" > "$tmp/srv/m2"; mv "$tmp/srv/m2" "$tmp/srv/manifest.json"
echo 'print("OLD")' > "$tmp/local/calvin_display_agent.py"
export CALVIN_UPDATE_HEALTH_TIMEOUT=2
if bash "$SCRIPT"; then echo "FAIL: should exit non-zero on rollback"; exit 1; fi
grep -q 'OLD' "$tmp/local/calvin_display_agent.py" || { echo "FAIL: not rolled back"; exit 1; }
grep -q 'rolled back' "$tmp/state/agent-update-state.json" || { echo "FAIL: no rollback state"; exit 1; }
echo "PASS rollback"
