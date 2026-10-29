#!/usr/bin/env bash
# Kiosk updater + Chromium's GPU path (calvin-scuh).
#
# An update must recompute CALVIN_CHROMIUM_DISPLAY_FLAGS in the existing session
# env: old kiosks lack the Pi 3 flag, and the board/setting can differ from what
# was installed. Everything else in the file is the operator's and stays.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
# shellcheck source=helpers/assert.sh
. "$HERE/helpers/assert.sh"
SCRIPT="$REPO/deploy/kiosk-agent/update-kiosk.sh"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/state" "$tmp/systemd" "$tmp/local" "$tmp/labwc" "$tmp/run" "$tmp/srv"
export SYSTEMCTL_LOG="$tmp/systemctl.log" ENV="$tmp/calvin-kiosk"
export CALVIN_DEVICE_TREE_MODEL="$tmp/model"

cat > "$ENV" <<'EOF'
CALVIN_BACKEND_URL=http://server.local:8000
CALVIN_DISPLAY_STACK=x11
EOF

# --- server-side bundle (one unit, so an update really swaps something) --------
printf '[Unit]\nDescription=Calvin Kiosk v1\n' > "$tmp/srv/calvin-kiosk-remote.service"

write_manifest() {  # version
    python3 - "$tmp/srv" "$tmp/systemd" "$1" > "$tmp/srv/manifest.json" <<'PY'
import hashlib, json, os, sys
srv, systemd, version = sys.argv[1:4]
name = "calvin-kiosk-remote.service"
sha = hashlib.sha256(open(os.path.join(srv, name), "rb").read()).hexdigest()
files = [{"name": name, "sha256": sha, "mode": "0644",
          "target_path": os.path.join(systemd, name),
          "restart_unit": name, "enable": False}]
print(json.dumps({"version": version, "min_python": "3.9", "files": files}))
PY
}

cat > "$tmp/bin/curl" <<EOF
#!/usr/bin/env bash
for a in "\$@"; do case "\$a" in
  */agent/manifest) cat "$tmp/srv/manifest.json"; exit 0;;
  */agent/files/*) cat "$tmp/srv/\${a##*/}"; exit 0;;
esac; done
exit 22
EOF
cat > "$tmp/bin/systemctl" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "$SYSTEMCTL_LOG"
[ "\$1" = "is-active" ] && exit 0
exit 0
EOF
cat > "$tmp/bin/id" <<'EOF'
#!/usr/bin/env bash
[ "${1:-}" = "-u" ] && { echo 1000; exit 0; }
exit 1
EOF
chmod +x "$tmp/bin/"*
export PATH="$tmp/bin:$PATH"

export CALVIN_KIOSK_ENV_FILE="$ENV"
export CALVIN_KIOSK_DISPLAY_ENV_FILE="$tmp/calvin-kiosk-display"
export CALVIN_CURL="$tmp/bin/curl" CALVIN_SYSTEMCTL="$tmp/bin/systemctl"
export CALVIN_AGENT_STATE_DIR="$tmp/state" CALVIN_SYSTEMD_DIR="$tmp/systemd"
export CALVIN_BIN_DIR="$tmp/local" CALVIN_LABWC_DIR="$tmp/labwc"
export CALVIN_AGENT_READY_MARKER="$tmp/run/agent-ready"
export CALVIN_UPDATE_HEALTH_TIMEOUT=2

flags() {
    local line
    line="$(grep -m1 '^CALVIN_CHROMIUM_DISPLAY_FLAGS=' "$CALVIN_KIOSK_DISPLAY_ENV_FILE" || true)"
    printf '%s' "${line#CALVIN_CHROMIUM_DISPLAY_FLAGS=}"
}
set_model() { printf '%s\0' "$1" > "$CALVIN_DEVICE_TREE_MODEL"; }

# An X11 kiosk that predates the flag, on a Pi 3B+.
set_model "Raspberry Pi 3 Model B Plus Rev 1.3"
cat > "$CALVIN_KIOSK_DISPLAY_ENV_FILE" <<'EOF'
# operator note
DISPLAY=:0
XAUTHORITY=/operator/choice
CALVIN_CHROMIUM_DISPLAY_FLAGS=
EOF

write_manifest v1
bash "$SCRIPT" >/dev/null
assert_eq "--disable-gpu" "$(flags)" "update did not add --disable-gpu on a Pi 3B+"
assert_contains "$CALVIN_KIOSK_DISPLAY_ENV_FILE" '^XAUTHORITY=/operator/choice$' \
    "update overwrote the operator's session env"
assert_contains "$CALVIN_KIOSK_DISPLAY_ENV_FILE" '^# operator note$' "update dropped an operator comment"
assert_contains "$SYSTEMCTL_LOG" '^restart calvin-kiosk-remote.service$' \
    "a changed Chromium flag must restart the kiosk unit"
pass "update adds the flag on a Pi 3B+ and restarts Chromium"

# Re-running with nothing new must not duplicate the flag (no-op update path).
rm -f "$SYSTEMCTL_LOG"
bash "$SCRIPT" >/dev/null
assert_eq "1" "$(grep -c '^CALVIN_CHROMIUM_DISPLAY_FLAGS=' "$CALVIN_KIOSK_DISPLAY_ENV_FILE")" \
    "a re-run duplicated the flags line"
assert_eq "--disable-gpu" "$(flags)" "a re-run dropped the flag"
pass "a no-op update keeps exactly one flags line"

# Wayland keeps its ozone flag and gets the GPU flag appended.
cat > "$ENV" <<'EOF'
CALVIN_BACKEND_URL=http://server.local:8000
CALVIN_DISPLAY_STACK=wayland
EOF
cat > "$CALVIN_KIOSK_DISPLAY_ENV_FILE" <<'EOF'
XDG_SESSION_TYPE=wayland
WAYLAND_DISPLAY=wayland-0
XDG_RUNTIME_DIR=/run/user/1000
CALVIN_CHROMIUM_DISPLAY_FLAGS=--ozone-platform=wayland
EOF
printf '[Unit]\nDescription=Calvin Kiosk v2\n' > "$tmp/srv/calvin-kiosk-remote.service"
write_manifest v2
bash "$SCRIPT" >/dev/null
assert_eq "--ozone-platform=wayland --disable-gpu" "$(flags)" \
    "wayland update must append --disable-gpu, not replace the ozone flag"
pass "wayland update appends --disable-gpu after --ozone-platform=wayland"

# A Pi 4 keeps the GPU: a stale flag is removed.
set_model "Raspberry Pi 4 Model B Rev 1.4"
cat > "$CALVIN_KIOSK_DISPLAY_ENV_FILE" <<'EOF'
DISPLAY=:0
XAUTHORITY=/home/calvin/.Xauthority
CALVIN_CHROMIUM_DISPLAY_FLAGS=--disable-gpu
EOF
cat > "$ENV" <<'EOF'
CALVIN_BACKEND_URL=http://server.local:8000
CALVIN_DISPLAY_STACK=x11
EOF
printf '[Unit]\nDescription=Calvin Kiosk v3\n' > "$tmp/srv/calvin-kiosk-remote.service"
write_manifest v3
bash "$SCRIPT" >/dev/null
assert_eq "" "$(flags)" "a Pi 4 must keep the GPU (stale --disable-gpu not removed)"
pass "a Pi 4 update keeps the GPU path"

# CALVIN_CHROMIUM_GPU=on in /etc/default/calvin-kiosk wins over the board.
set_model "Raspberry Pi 3 Model B Plus Rev 1.3"
cat > "$ENV" <<'EOF'
CALVIN_BACKEND_URL=http://server.local:8000
CALVIN_DISPLAY_STACK=x11
CALVIN_CHROMIUM_GPU=on
EOF
printf '[Unit]\nDescription=Calvin Kiosk v4\n' > "$tmp/srv/calvin-kiosk-remote.service"
write_manifest v4
bash "$SCRIPT" >/dev/null
assert_eq "" "$(flags)" "CALVIN_CHROMIUM_GPU=on must keep the GPU on a Pi 3"

# A missing session env on a Pi 3 is created with the flag already in it.
rm -f "$CALVIN_KIOSK_DISPLAY_ENV_FILE"
sed -i '/^CALVIN_CHROMIUM_GPU=/d' "$ENV"
printf '[Unit]\nDescription=Calvin Kiosk v5\n' > "$tmp/srv/calvin-kiosk-remote.service"
write_manifest v5
bash "$SCRIPT" >/dev/null
assert_eq "--disable-gpu" "$(flags)" "a newly created session env lacks the Pi 3 flag"
pass "a newly created session env already carries the flag"

echo "PASS"
