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
# On restart, spawn a background process that recreates the readiness marker after
# a short delay, simulating the new agent coming up after the updater clears it.
cat > "$tmp/bin/systemctl" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "$tmp/systemctl.log"
if [ "\$1" = "restart" ]; then
  ( sleep 1 && mkdir -p "$tmp/run" && touch "$tmp/run/agent-ready" ) &
fi
case "\$1" in "is-active"|"show") exit 0;; esac
exit 0
EOF
chmod +x "$tmp/bin/curl" "$tmp/bin/systemctl"

export CALVIN_BACKEND_URL="http://server.local:8000"
export CALVIN_CURL="$tmp/bin/curl" CALVIN_SYSTEMCTL="$tmp/bin/systemctl"
export CALVIN_AGENT_STATE_DIR="$tmp/state" CALVIN_SYSTEMD_DIR="$tmp/systemd"
export CALVIN_AGENT_READY_MARKER="$tmp/run/agent-ready"
export CALVIN_UPDATE_HEALTH_TIMEOUT=4

# No pre-created marker: the updater deletes any stale marker after restart,
# and the mock restart above recreates it to simulate a healthy new agent.

bash "$SCRIPT"

grep -q 'sys.exit(0)' "$tmp/local/calvin_display_agent.py" || { echo "FAIL: agent not swapped"; exit 1; }
grep -q 'restart calvin-display-agent.service' "$tmp/systemctl.log" || { echo "FAIL: did not restart changed unit"; exit 1; }
grep -q 'deadbeefdeadbeef' "$tmp/state/agent-version.json" || { echo "FAIL: version not recorded"; exit 1; }
echo "PASS happy-path"

# --- python-too-old: manifest demands 3.99 ---
rm -f "$tmp/state/agent-update-state.json"
sed 's/"3.9"/"3.99"/' "$tmp/srv/manifest.json" > "$tmp/srv/manifest.json.hi"
mv "$tmp/srv/manifest.json.hi" "$tmp/srv/manifest.json"
echo 'print("OLD")' > "$tmp/local/calvin_display_agent.py"
if bash "$SCRIPT"; then echo "FAIL: should abort on python-too-old"; exit 1; fi
grep -q 'python-too-old' "$tmp/state/agent-update-state.json" || { echo "FAIL: no python-too-old state"; exit 1; }
grep -q 'OLD' "$tmp/local/calvin_display_agent.py" || { echo "FAIL: agent changed despite abort"; exit 1; }
echo "PASS python-too-old"

# --- rollback: is-active fails -> restore backup ---
rm -f "$tmp/state/agent-update-state.json"
cat > "$tmp/bin/systemctl" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "$tmp/systemctl.log"
[ "\$1" = "is-active" ] && exit 3   # never healthy
exit 0
EOF
chmod +x "$tmp/bin/systemctl"
sed 's/"3.99"/"3.9"/' "$tmp/srv/manifest.json" > "$tmp/srv/m2"; mv "$tmp/srv/m2" "$tmp/srv/manifest.json"
echo 'print("OLD")' > "$tmp/local/calvin_display_agent.py"
# Add a brand-new file to the bundle (no prior install) to prove rollback removes it
NEW_CONFIG="$tmp/local/calvin_new_config.py"
printf 'NEW_CONFIG=True\n' > "$tmp/srv/calvin_new_config.py"
NEW_CONFIG_SHA="$(sha256sum "$tmp/srv/calvin_new_config.py" | cut -d' ' -f1)"
python3 - "$tmp/srv/manifest.json" "$NEW_CONFIG_SHA" "$NEW_CONFIG" <<'PY'
import json, sys
path, sha, target = sys.argv[1:4]
m = json.load(open(path))
m["files"].append({"name":"calvin_new_config.py","sha256":sha,"mode":"0644","target_path":target,"restart_unit":"calvin-display-agent.service"})
json.dump(m, open(path,"w"))
PY
# Patch mock curl to serve the new file too
cat > "$tmp/bin/curl" <<EOF
#!/usr/bin/env bash
for a in "\$@"; do case "\$a" in
  */agent/manifest) cat "$tmp/srv/manifest.json"; exit 0;;
  */agent/files/calvin_display_agent.py) cat "$tmp/srv/calvin_display_agent.py"; exit 0;;
  */agent/files/calvin_new_config.py) cat "$tmp/srv/calvin_new_config.py"; exit 0;;
esac; done
exit 22
EOF
chmod +x "$tmp/bin/curl"
export CALVIN_UPDATE_HEALTH_TIMEOUT=2
if bash "$SCRIPT"; then echo "FAIL: should exit non-zero on rollback"; exit 1; fi
grep -q 'OLD' "$tmp/local/calvin_display_agent.py" || { echo "FAIL: not rolled back"; exit 1; }
grep -q 'rolled back' "$tmp/state/agent-update-state.json" || { echo "FAIL: no rollback state"; exit 1; }
[ ! -f "$NEW_CONFIG" ] || { echo "FAIL: newly-introduced file not removed on rollback"; exit 1; }
echo "PASS rollback"

# --- noop: sha already matches; nothing should change ---
# Restore healthy systemctl for this block
cat > "$tmp/bin/systemctl" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "$tmp/systemctl.log"
if [ "\$1" = "restart" ]; then
  ( sleep 1 && mkdir -p "$tmp/run" && touch "$tmp/run/agent-ready" ) &
fi
case "\$1" in "is-active"|"show") exit 0;; esac
exit 0
EOF
chmod +x "$tmp/bin/systemctl"
# Build a minimal manifest whose sha matches the currently-installed agent bytes
mkdir -p "$tmp/srv2"
printf 'import sys\nsys.exit(0)\n' > "$tmp/local/calvin_display_agent.py"
NOOP_SHA="$(sha256sum "$tmp/local/calvin_display_agent.py" | cut -d' ' -f1)"
cp "$tmp/local/calvin_display_agent.py" "$tmp/srv2/calvin_display_agent.py"
cat > "$tmp/srv2/manifest.json" <<MEOF
{"version":"noopversion1234","min_python":"3.9","files":[
 {"name":"calvin_display_agent.py","sha256":"$NOOP_SHA","mode":"0755",
  "target_path":"$tmp/local/calvin_display_agent.py","restart_unit":"calvin-display-agent.service"}]}
MEOF
# Point mock curl at the noop manifest
cat > "$tmp/bin/curl" <<EOF
#!/usr/bin/env bash
for a in "\$@"; do case "\$a" in
  */agent/manifest) cat "$tmp/srv2/manifest.json"; exit 0;;
  */agent/files/calvin_display_agent.py) cat "$tmp/srv2/calvin_display_agent.py"; exit 0;;
esac; done
exit 22
EOF
chmod +x "$tmp/bin/curl"
rm -f "$tmp/systemctl.log" "$tmp/state/agent-update-state.json"
export CALVIN_UPDATE_HEALTH_TIMEOUT=4
bash "$SCRIPT" || { echo "FAIL noop: script exited non-zero"; exit 1; }
grep -q 'noopversion1234' "$tmp/state/agent-version.json" || { echo "FAIL noop: version not recorded"; exit 1; }
! grep -q 'restart' "$tmp/systemctl.log" 2>/dev/null || { echo "FAIL noop: unexpected restart in systemctl.log"; exit 1; }
grep -q 'noop\|success' "$tmp/state/agent-update-state.json" || { echo "FAIL noop: state not success/noop"; exit 1; }
echo "PASS noop"

# --- --self-check contract: exits 0 on a good manifest and mutates nothing ---
mkdir -p "$tmp/state_sc"; rm -f "$tmp/systemctl.log"
cat > "$tmp/srv/sc_manifest.json" <<'MEOF'
{"version":"scv0000000000000","min_python":"3.9","files":[]}
MEOF
cat > "$tmp/bin/curl" <<CEOF
#!/usr/bin/env bash
for a in "\$@"; do case "\$a" in
  */agent/manifest) cat "$tmp/srv/sc_manifest.json"; exit 0;;
esac; done
exit 22
CEOF
chmod +x "$tmp/bin/curl"
CALVIN_AGENT_STATE_DIR="$tmp/state_sc" bash "$SCRIPT" --self-check || { echo "FAIL self-check: expected exit 0"; exit 1; }
[ ! -e "$tmp/state_sc/agent-update-state.json" ] || { echo "FAIL self-check: wrote state file"; exit 1; }
[ ! -e "$tmp/state_sc/agent-version.json" ]      || { echo "FAIL self-check: wrote version file"; exit 1; }
[ ! -e "$tmp/systemctl.log" ]                    || { echo "FAIL self-check: called systemctl"; exit 1; }
echo "PASS self-check-ok"

# --- --self-check fails when the backend is unreachable ---
cat > "$tmp/bin/curl" <<'CEOF'
#!/usr/bin/env bash
exit 7
CEOF
chmod +x "$tmp/bin/curl"
if CALVIN_AGENT_STATE_DIR="$tmp/state_sc" bash "$SCRIPT" --self-check; then echo "FAIL self-check: expected non-zero on unreachable backend"; exit 1; fi
echo "PASS self-check-unreachable"

# ===== Updater self-verification: verify the new updater before adopting it =====
UPD_TARGET="$tmp/local/update-kiosk.sh"

# healthy systemctl for these blocks (agent restart recreates the readiness marker)
cat > "$tmp/bin/systemctl" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "$tmp/systemctl.log"
if [ "\$1" = "restart" ]; then ( sleep 1 && mkdir -p "$tmp/run" && touch "$tmp/run/agent-ready" ) & fi
case "\$1" in "is-active"|"show") exit 0;; esac
exit 0
EOF
chmod +x "$tmp/bin/systemctl"
export CALVIN_UPDATE_HEALTH_TIMEOUT=4

# Build a manifest with a CHANGED agent + the updater entry, and a curl mock that
# serves the given "new updater" content. $1 = path to the new-updater file to serve.
make_updater_manifest() {
  cp "$1" "$tmp/srv/update-kiosk.sh"
  local upd_sha agent_sha
  upd_sha="$(sha256sum "$tmp/srv/update-kiosk.sh" | cut -d' ' -f1)"
  printf 'import sys\nsys.exit(0)\n' > "$tmp/srv/calvin_display_agent.py"
  echo 'print("OLD")' > "$tmp/local/calvin_display_agent.py"          # installed agent differs => "changed"
  agent_sha="$(sha256sum "$tmp/srv/calvin_display_agent.py" | cut -d' ' -f1)"
  cat > "$tmp/srv/manifest.json" <<MEOF
{"version":"upd0000000000000","min_python":"3.9","files":[
 {"name":"calvin_display_agent.py","sha256":"$agent_sha","mode":"0755","target_path":"$tmp/local/calvin_display_agent.py","restart_unit":"calvin-display-agent.service"},
 {"name":"update-kiosk.sh","sha256":"$upd_sha","mode":"0755","target_path":"$UPD_TARGET","restart_unit":""}]}
MEOF
  cat > "$tmp/bin/curl" <<'CEOF'
#!/usr/bin/env bash
for a in "$@"; do case "$a" in
  */agent/manifest) cat "SRVDIR/manifest.json"; exit 0;;
  */agent/files/calvin_display_agent.py) cat "SRVDIR/calvin_display_agent.py"; exit 0;;
  */agent/files/update-kiosk.sh) cat "SRVDIR/update-kiosk.sh"; exit 0;;
esac; done
exit 22
CEOF
  sed -i "s#SRVDIR#$tmp/srv#g" "$tmp/bin/curl"
  chmod +x "$tmp/bin/curl"
}
reset_updater() { printf '#!/usr/bin/env bash\necho OLD-UPDATER\n' > "$UPD_TARGET"; }

# --- valid new updater: passes bash -n and --self-check -> adopted ---
cat > "$tmp/newupd_ok.sh" <<'UEOF'
#!/usr/bin/env bash
[ "${1:-}" = "--self-check" ] && exit 0
exit 0
UEOF
make_updater_manifest "$tmp/newupd_ok.sh"; reset_updater
rm -f "$tmp/state/agent-update-state.json"
bash "$SCRIPT" || { echo "FAIL updater-valid: script exited non-zero"; exit 1; }
{ grep -q -- '--self-check' "$UPD_TARGET" && ! grep -q 'OLD-UPDATER' "$UPD_TARGET"; } || { echo "FAIL updater-valid: new updater not adopted"; exit 1; }
echo "PASS updater-valid-adopted"

# --- broken-syntax new updater: bash -n fails -> whole update aborts atomically ---
printf '#!/usr/bin/env bash\nif [ ; then echo broken\n' > "$tmp/newupd_bad.sh"
make_updater_manifest "$tmp/newupd_bad.sh"; reset_updater
echo 'print("OLD")' > "$tmp/local/calvin_display_agent.py"
rm -f "$tmp/state/agent-update-state.json"
if bash "$SCRIPT"; then echo "FAIL updater-broken: should abort"; exit 1; fi
grep -q 'OLD-UPDATER' "$UPD_TARGET" || { echo "FAIL updater-broken: updater changed despite abort"; exit 1; }
grep -q 'OLD' "$tmp/local/calvin_display_agent.py" || { echo "FAIL updater-broken: agent swapped despite abort (not atomic)"; exit 1; }
grep -q 'verify' "$tmp/state/agent-update-state.json" || { echo "FAIL updater-broken: no verify error state"; exit 1; }
echo "PASS updater-broken-syntax-aborts"

# --- self-check-failing new updater: parses but --self-check exits 1 -> aborts atomically ---
cat > "$tmp/newupd_sc.sh" <<'UEOF'
#!/usr/bin/env bash
[ "${1:-}" = "--self-check" ] && exit 1
exit 0
UEOF
make_updater_manifest "$tmp/newupd_sc.sh"; reset_updater
echo 'print("OLD")' > "$tmp/local/calvin_display_agent.py"
rm -f "$tmp/state/agent-update-state.json"
if bash "$SCRIPT"; then echo "FAIL updater-selfcheck: should abort"; exit 1; fi
grep -q 'OLD-UPDATER' "$UPD_TARGET" || { echo "FAIL updater-selfcheck: updater changed despite abort"; exit 1; }
grep -q 'OLD' "$tmp/local/calvin_display_agent.py" || { echo "FAIL updater-selfcheck: agent swapped despite abort"; exit 1; }
grep -q 'verify' "$tmp/state/agent-update-state.json" || { echo "FAIL updater-selfcheck: no verify error state"; exit 1; }
echo "PASS updater-selfcheck-fails-aborts"
