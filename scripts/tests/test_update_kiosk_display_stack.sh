#!/usr/bin/env bash
# Kiosk updater + Wayland (phase 1): the bundle may install calvin-wayland.service
# and the labwc config, but must never re-enable the compositor of the OTHER
# display stack, and must create the session env file older kiosks lack.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
# shellcheck source=helpers/assert.sh
. "$HERE/helpers/assert.sh"
SCRIPT="$REPO/deploy/kiosk-agent/update-kiosk.sh"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/state" "$tmp/systemd" "$tmp/local" "$tmp/labwc" "$tmp/run" "$tmp/srv"
export SYSTEMCTL_LOG="$tmp/systemctl.log" ENV="$tmp/calvin-kiosk"

# The kiosk's /etc/default/calvin-kiosk.
cat > "$ENV" <<'EOF'
CALVIN_BACKEND_URL=http://server.local:8000
CALVIN_DISPLAY_STACK=wayland
EOF

# --- server-side bundle -------------------------------------------------------
printf '[Unit]\nDescription=Calvin Wayland Compositor\n' > "$tmp/srv/calvin-wayland.service"
# shellcheck disable=SC2016  # literal script content
printf '#!/bin/sh\nwlr-randr --output "$out" --on\n' > "$tmp/srv/autostart"
printf '<labwc_config><core><autoEnableOutputs>no</autoEnableOutputs></core></labwc_config>\n' \
    > "$tmp/srv/rc.xml"
printf '[Unit]\nDescription=Calvin X Server\n' > "$tmp/srv/calvin-x.service"
# calvin-x.service is in the bundle with enable=true and a restart_unit; it is NOT
# newly installed, so reenable_units() is what would try to enable it again, and
# restart_all() what would try to restart it. Give it different content so the
# update really wants both.
printf '[Unit]\nDescription=Calvin X Server (new bundle copy)\n' > "$tmp/systemd/calvin-x.service"

write_manifest() {  # version
    python3 - "$tmp/srv" "$tmp/systemd" "$tmp/labwc" "$1" > "$tmp/srv/manifest.json" <<'PY'
import hashlib, json, os, sys
srv, systemd, labwc, version = sys.argv[1:5]
def entry(name, target, mode, enable=False, restart_unit=""):
    sha = hashlib.sha256(open(os.path.join(srv, name), "rb").read()).hexdigest()
    return {"name": name, "sha256": sha, "mode": mode, "target_path": target,
            "restart_unit": restart_unit, "enable": enable}
files = [
    entry("calvin-wayland.service", os.path.join(systemd, "calvin-wayland.service"), "0644"),
    entry("autostart", os.path.join(labwc, "autostart"), "0755"),
    entry("rc.xml", os.path.join(labwc, "rc.xml"), "0644"),
    entry("calvin-x.service", os.path.join(systemd, "calvin-x.service"), "0644",
          True, "calvin-x.service"),
]
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
[ "\$1" = "is-active" ] && exit 0   # no health check in this manifest anyway
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

write_manifest v1
bash "$SCRIPT" >/dev/null

# Session env for the running stack, created because the kiosk predates it.
assert_contains "$CALVIN_KIOSK_DISPLAY_ENV_FILE" '^XDG_SESSION_TYPE=wayland$' \
    "updater did not create the wayland session env"
assert_contains "$CALVIN_KIOSK_DISPLAY_ENV_FILE" '^WAYLAND_DISPLAY=wayland-0$' \
    "wayland session env lacks WAYLAND_DISPLAY"
assert_contains "$CALVIN_KIOSK_DISPLAY_ENV_FILE" '^XDG_RUNTIME_DIR=/run/user/1000$' \
    "wayland session env lacks the computed XDG_RUNTIME_DIR"
assert_contains "$CALVIN_KIOSK_DISPLAY_ENV_FILE" '^CALVIN_CHROMIUM_DISPLAY_FLAGS=--ozone-platform=wayland$' \
    "wayland session env lacks the Chromium ozone flag"
pass "updater creates the wayland session env file"

# The Wayland unit + labwc config are installed, in the right places and modes.
[ -f "$tmp/systemd/calvin-wayland.service" ] || fail "calvin-wayland.service not installed"
[ -f "$tmp/labwc/autostart" ] || fail "labwc autostart not installed"
[ -f "$tmp/labwc/rc.xml" ] || fail "labwc rc.xml not installed"
assert_mode "$tmp/labwc/autostart" 755
assert_mode "$tmp/labwc/rc.xml" 644
pass "updater installs the wayland unit and labwc config"

# ... and the X11 compositor stays disabled and untouched.
if grep -qx 'enable calvin-x.service' "$SYSTEMCTL_LOG"; then
    fail "updater enabled calvin-x.service on a wayland kiosk"
fi
if grep -qx 'restart calvin-x.service' "$SYSTEMCTL_LOG"; then
    fail "updater restarted calvin-x.service on a wayland kiosk (would stop labwc)"
fi
grep -q 'disable calvin-wayland.service' "$SYSTEMCTL_LOG" \
    && fail "updater disabled the compositor the kiosk is running"
pass "updater never enables or restarts the other stack's compositor"

# --- switched back to X11 -----------------------------------------------------
rm -f "$SYSTEMCTL_LOG" "$tmp/labwc/rc.xml"
rm -f "$CALVIN_KIOSK_DISPLAY_ENV_FILE"
cat > "$ENV" <<'EOF'
CALVIN_BACKEND_URL=http://server.local:8000
CALVIN_DISPLAY_STACK=x11
EOF
write_manifest v2
bash "$SCRIPT" >/dev/null

assert_contains "$CALVIN_KIOSK_DISPLAY_ENV_FILE" '^DISPLAY=:0$' \
    "updater did not create the x11 session env"
assert_contains "$CALVIN_KIOSK_DISPLAY_ENV_FILE" '^XAUTHORITY=/home/calvin/.Xauthority$' \
    "x11 session env lacks XAUTHORITY"
assert_contains "$CALVIN_KIOSK_DISPLAY_ENV_FILE" '^CALVIN_CHROMIUM_DISPLAY_FLAGS=$' \
    "x11 session env must define an empty Chromium flag"
assert_not_contains "$CALVIN_KIOSK_DISPLAY_ENV_FILE" 'WAYLAND_DISPLAY' \
    "x11 session env still sets WAYLAND_DISPLAY"
if grep -q 'enable calvin-wayland.service' "$SYSTEMCTL_LOG"; then
    fail "updater enabled calvin-wayland.service on an x11 kiosk"
fi
pass "updater follows a stack switch back to x11"

# An existing session env is never overwritten: setup owns its content.
printf 'DISPLAY=:0\nXAUTHORITY=/operator/choice\n' > "$CALVIN_KIOSK_DISPLAY_ENV_FILE"
write_manifest v3
bash "$SCRIPT" >/dev/null
assert_contains "$CALVIN_KIOSK_DISPLAY_ENV_FILE" '^XAUTHORITY=/operator/choice$' \
    "updater overwrote an existing session env"
pass "updater leaves an existing session env alone"

echo "PASS"
