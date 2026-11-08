#!/usr/bin/env bash
# calvin-grwq: update-kiosk.sh (and so setup, which bootstraps through it) turns
# Wi-Fi power saving off persistently and idempotently. A power-saving brcmfmac
# radio (Pi 3B+) drops broadcast ARP, so the kiosk polls out fine but the LAN
# cannot reach it. NetworkManager kiosks get wifi.powersave=2 in a conf.d drop-in;
# others get a oneshot unit running iw. Nothing here touches a real radio.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
# shellcheck source=helpers/assert.sh
. "$HERE/helpers/assert.sh"
SCRIPT="$REPO/deploy/kiosk-agent/update-kiosk.sh"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/state" "$tmp/systemd" "$tmp/local" "$tmp/srv" "$tmp/nm" "$tmp/net"
export SYSTEMCTL_LOG="$tmp/systemctl.log" ENV="$tmp/calvin-kiosk"
printf 'CALVIN_BACKEND_URL=http://server.local:8000\nCALVIN_DISPLAY_STACK=cog\n' > "$ENV"

printf '{"version":"v1","min_python":"3.9","files":[]}\n' > "$tmp/srv/manifest.json"
cat > "$tmp/bin/curl" <<EOF
#!/usr/bin/env bash
for a in "\$@"; do case "\$a" in
  */agent/manifest) cat "$tmp/srv/manifest.json"; exit 0;;
esac; done
exit 22
EOF
# NM_ACTIVE=1 makes NetworkManager look active.
cat > "$tmp/bin/systemctl" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "$SYSTEMCTL_LOG"
case "\$*" in
  *NetworkManager*) [ "\${NM_ACTIVE:-0}" = 1 ]; exit \$?;;
  *is-enabled*) [ "\${UNIT_ENABLED:-0}" = 1 ]; exit \$?;;
  *is-active*calvin-wifi-powersave*) [ "\${UNIT_ACTIVE:-0}" = 1 ]; exit \$?;;
esac
exit 0
EOF
cat > "$tmp/bin/nmcli" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "$tmp/nmcli.log"
exit 0
EOF
cat > "$tmp/bin/iw" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "$tmp/iw.log"
exit 0
EOF
cat > "$tmp/bin/apt-get" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "$tmp/apt.log"
exit 0
EOF
cat > "$tmp/bin/id" <<'EOF'
#!/usr/bin/env bash
[ "${1:-}" = "-u" ] && { echo 1000; exit 0; }
exit 1
EOF
chmod +x "$tmp/bin/"*

export CALVIN_KIOSK_ENV_FILE="$ENV" CALVIN_KIOSK_DISPLAY_ENV_FILE="$tmp/display"
export CALVIN_CURL="$tmp/bin/curl" CALVIN_SYSTEMCTL="$tmp/bin/systemctl"
export CALVIN_AGENT_STATE_DIR="$tmp/state" CALVIN_SYSTEMD_DIR="$tmp/systemd"
export CALVIN_BIN_DIR="$tmp/local" CALVIN_LABWC_DIR="$tmp/labwc"
export CALVIN_NM_CONF_DIR="$tmp/nm" CALVIN_SYS_NET_DIR="$tmp/net"
export CALVIN_NMCLI="$tmp/bin/nmcli" CALVIN_IW="$tmp/bin/iw" CALVIN_APT_GET="$tmp/bin/apt-get"
export CALVIN_AGENT_READY_MARKER="$tmp/run/agent-ready" CALVIN_UPDATE_HEALTH_TIMEOUT=2
DROPIN="$tmp/nm/calvin-wifi-powersave.conf"
UNIT="$tmp/systemd/calvin-wifi-powersave.service"

# --- no wireless interface: nothing is written --------------------------------
NM_ACTIVE=1 bash "$SCRIPT" >/dev/null
[ ! -e "$DROPIN" ] && [ ! -e "$UNIT" ] || fail "wrote Wi-Fi power-save config on a kiosk without wlan0"
pass "no wlan0, no Wi-Fi power-save config"

# --- NetworkManager kiosk (Bookworm/Trixie) -----------------------------------
mkdir -p "$tmp/net/wlan0/wireless"
NM_ACTIVE=1 bash "$SCRIPT" >/dev/null
assert_contains "$DROPIN" '^\[connection\]$' "drop-in lacks the [connection] section"
assert_contains "$DROPIN" '^wifi\.powersave *= *2$' "drop-in does not set wifi.powersave=2"
[ ! -e "$UNIT" ] || fail "a NetworkManager kiosk must not also get the iw oneshot"
assert_contains "$tmp/nmcli.log" 'general reload' "NetworkManager was not asked to reload its config"
assert_contains "$tmp/iw.log" 'dev wlan0 set power_save off' "the running radio was not switched off now"
pass "NetworkManager kiosk gets wifi.powersave=2 and the radio is switched off now"

# Idempotent: an unchanged drop-in is not rewritten and NM is not reloaded again.
touch -d '2001-01-01' "$DROPIN"
rm -f "$tmp/nmcli.log"
NM_ACTIVE=1 bash "$SCRIPT" >/dev/null
[ "$(stat -c %Y "$DROPIN")" = "$(date -d 2001-01-01 +%s)" ] || fail "unchanged drop-in was rewritten"
[ ! -s "$tmp/nmcli.log" ] || fail "NetworkManager was reloaded though nothing changed"
pass "second run changes nothing"

# --- no NetworkManager: oneshot unit ------------------------------------------
rm -f "$DROPIN" "$SYSTEMCTL_LOG"
NM_ACTIVE=0 bash "$SCRIPT" >/dev/null
[ ! -e "$DROPIN" ] || fail "a non-NetworkManager kiosk got an NM drop-in"
assert_contains "$UNIT" '^Type=oneshot$' "unit is not a oneshot"
assert_contains "$UNIT" '^RemainAfterExit=yes$' "unit lacks RemainAfterExit"
assert_contains "$UNIT" 'power_save off' "unit does not turn power save off"
assert_contains "$UNIT" '^WantedBy=multi-user\.target$' "unit is not wanted at boot"
assert_contains "$SYSTEMCTL_LOG" '^enable calvin-wifi-powersave\.service$' "unit was not enabled"
assert_contains "$SYSTEMCTL_LOG" 'start calvin-wifi-powersave\.service' "unit was not started now"
pass "non-NetworkManager kiosk gets a persistent iw oneshot"

rm -f "$SYSTEMCTL_LOG"
touch -d '2001-01-01' "$UNIT"
NM_ACTIVE=0 UNIT_ENABLED=1 UNIT_ACTIVE=1 bash "$SCRIPT" >/dev/null
[ "$(stat -c %Y "$UNIT")" = "$(date -d 2001-01-01 +%s)" ] || fail "unchanged unit was rewritten"
assert_not_contains "$SYSTEMCTL_LOG" 'daemon-reload' "daemon-reload ran though the unit is unchanged"
assert_not_contains "$SYSTEMCTL_LOG" 'enable calvin-wifi-powersave|start calvin-wifi-powersave' \
    "an enabled, active oneshot was touched again"
pass "second oneshot run changes nothing"

# An unchanged unit that FAILED last time (iw was missing) is started again on the
# next update, not skipped because the file is the same.
rm -f "$SYSTEMCTL_LOG"
NM_ACTIVE=0 UNIT_ENABLED=1 UNIT_ACTIVE=0 bash "$SCRIPT" >/dev/null
assert_contains "$SYSTEMCTL_LOG" 'start calvin-wifi-powersave\.service' \
    "a failed oneshot was not retried"
[ "$(stat -c %Y "$UNIT")" = "$(date -d 2001-01-01 +%s)" ] || fail "retry rewrote the unit"
pass "a failed oneshot is retried on the next update"

# --- iw: the update path installs it when it is missing -------------------------
rm -f "$tmp/apt.log"
mv "$tmp/bin/iw" "$tmp/bin/iw.off"
NM_ACTIVE=1 bash "$SCRIPT" >/dev/null
assert_contains "$tmp/apt.log" 'install .*iw' "a kiosk without iw was not offered the iw package"
mv "$tmp/bin/iw.off" "$tmp/bin/iw"
rm -f "$tmp/apt.log"
NM_ACTIVE=1 bash "$SCRIPT" >/dev/null
[ ! -s "$tmp/apt.log" ] || fail "apt ran though iw is installed"
pass "the updater installs iw only when it is missing"

# --- a failing radio command never blocks the update --------------------------
printf '#!/usr/bin/env bash\nexit 1\n' > "$tmp/bin/iw"
rm -f "$DROPIN"
NM_ACTIVE=1 bash "$SCRIPT" >/dev/null || fail "a failing iw aborted the updater"
pass "a failing iw is logged, not fatal"
