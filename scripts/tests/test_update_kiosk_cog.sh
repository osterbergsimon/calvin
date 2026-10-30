#!/usr/bin/env bash
# Kiosk updater + cog: the bundle may install calvin-cog.service and the panel
# helper, but must never enable the cog unit on an X11/Wayland kiosk (or the other
# stacks' units on cog), and must keep Chromium off the cog stack.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
# shellcheck source=helpers/assert.sh
. "$HERE/helpers/assert.sh"
SCRIPT="$REPO/deploy/kiosk-agent/update-kiosk.sh"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/state" "$tmp/systemd" "$tmp/local" "$tmp/run" "$tmp/srv"
export SYSTEMCTL_LOG="$tmp/systemctl.log" ENV="$tmp/calvin-kiosk"

cat > "$ENV" <<'EOF'
CALVIN_BACKEND_URL=http://server.local:8000
CALVIN_DISPLAY_STACK=cog
EOF

printf '[Unit]\nDescription=Calvin cog kiosk\n' > "$tmp/srv/calvin-cog.service"
printf '#!/usr/bin/env bash\necho panel\n' > "$tmp/srv/calvin-cog-panel.sh"
# Existing, modified units whose enable=1 would be re-enabled by reenable_units()
# on a cog kiosk if unit_suppressed() did not know about cog.
printf '[Unit]\nDescription=Calvin X Server (new bundle copy)\n' > "$tmp/systemd/calvin-x.service"
printf '[Unit]\nDescription=Chromium kiosk (new bundle copy)\n' \
    > "$tmp/systemd/calvin-kiosk-remote.service"
printf '[Unit]\nDescription=Calvin X Server\n' > "$tmp/srv/calvin-x.service"
printf '[Unit]\nDescription=Chromium kiosk\n' > "$tmp/srv/calvin-kiosk-remote.service"

write_manifest() {  # version
    python3 - "$tmp/srv" "$tmp/systemd" "$tmp/local" "$1" > "$tmp/srv/manifest.json" <<'PY'
import hashlib, json, os, sys
srv, systemd, local, version = sys.argv[1:5]
def entry(name, target, mode, enable=False, restart_unit=""):
    sha = hashlib.sha256(open(os.path.join(srv, name), "rb").read()).hexdigest()
    return {"name": name, "sha256": sha, "mode": mode, "target_path": target,
            "restart_unit": restart_unit, "enable": enable}
files = [
    entry("calvin-cog.service", os.path.join(systemd, "calvin-cog.service"), "0644"),
    entry("calvin-cog-panel.sh", os.path.join(local, "calvin-cog-panel.sh"), "0755"),
    entry("calvin-x.service", os.path.join(systemd, "calvin-x.service"), "0644",
          True, "calvin-x.service"),
    entry("calvin-kiosk-remote.service",
          os.path.join(systemd, "calvin-kiosk-remote.service"), "0644",
          True, "calvin-kiosk-remote.service"),
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
[ "\$1" = "is-enabled" ] && exit 1
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

write_manifest v1
bash "$SCRIPT" >/dev/null

# The cog unit + root helper are installed at their pinned paths and modes.
[ -f "$tmp/systemd/calvin-cog.service" ] || fail "calvin-cog.service not installed"
[ -f "$tmp/local/calvin-cog-panel.sh" ] || fail "calvin-cog-panel.sh not installed"
assert_mode "$tmp/local/calvin-cog-panel.sh" 755
pass "updater installs the cog unit and panel helper"

# The cog session env exists (the unit and agent both need the file) and carries
# no X/Wayland variables.
assert_contains "$CALVIN_KIOSK_DISPLAY_ENV_FILE" '^CALVIN_CHROMIUM_DISPLAY_FLAGS=$' \
    "cog session env must define an empty Chromium flag"
assert_not_contains "$CALVIN_KIOSK_DISPLAY_ENV_FILE" '^DISPLAY=' \
    "cog session env sets DISPLAY"
assert_not_contains "$CALVIN_KIOSK_DISPLAY_ENV_FILE" '^WAYLAND_DISPLAY=' \
    "cog session env sets WAYLAND_DISPLAY"
pass "updater creates a cog session env without X/Wayland variables"

# A bundle update never enables the other display owners, never restarts X (they
# conflict with cog), and keeps Chromium disabled on this stack.
if grep -qx 'enable calvin-x.service' "$SYSTEMCTL_LOG"; then
    fail "updater enabled calvin-x.service on a cog kiosk"
fi
if grep -qx 'enable calvin-kiosk-remote.service' "$SYSTEMCTL_LOG"; then
    fail "updater enabled Chromium on a cog kiosk"
fi
if grep -qx 'restart calvin-x.service' "$SYSTEMCTL_LOG"; then
    fail "updater restarted calvin-x.service on a cog kiosk"
fi
if grep -qx 'restart calvin-kiosk-remote.service' "$SYSTEMCTL_LOG"; then
    fail "updater restarted Chromium on a cog kiosk"
fi
if grep -qx 'enable calvin-cog.service' "$SYSTEMCTL_LOG"; then
    fail "the bundle must never enable calvin-cog.service itself"
fi
pass "updater never switches the stack or starts Chromium on cog"

# --- switched back to X11 -----------------------------------------------------
rm -f "$SYSTEMCTL_LOG"
# The installer rewrites the session env on a stack switch (setup owns it);
# the updater only creates a missing one for kiosks that predate the file.
rm -f "$CALVIN_KIOSK_DISPLAY_ENV_FILE"
cat > "$ENV" <<'EOF'
CALVIN_BACKEND_URL=http://server.local:8000
CALVIN_DISPLAY_STACK=x11
EOF
write_manifest v2
bash "$SCRIPT" >/dev/null

assert_contains "$CALVIN_KIOSK_DISPLAY_ENV_FILE" '^DISPLAY=:0$' \
    "updater did not create the x11 session env"
assert_contains "$SYSTEMCTL_LOG" '^enable calvin-kiosk-remote.service$' \
    "Chromium was not re-enabled after switching away from cog"
if grep -qx 'enable calvin-cog.service' "$SYSTEMCTL_LOG"; then
    fail "updater enabled calvin-cog.service on an x11 kiosk"
fi
if grep -qx 'disable calvin-kiosk-remote.service' "$SYSTEMCTL_LOG"; then
    fail "updater disabled Chromium on an x11 kiosk"
fi
pass "updater follows a stack switch from cog back to x11"

echo "PASS"
