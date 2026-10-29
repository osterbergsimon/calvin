#!/usr/bin/env bash
# K7: the kiosk updater let the manifest write any file under /usr/local/bin or
# /etc/systemd/system, with any mode (setuid) and any restart_unit. It now only
# installs the bundle's known files, each at its own path and mode, and only
# restarts known units. Units that should be enabled are re-enabled on every run
# (one that failed to enable used to stay disabled). A manifest that adds a file
# the running updater does not know is still applied when it also ships the
# newer updater: known files first, then the new updater re-runs for the rest.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$HERE/../../deploy/kiosk-agent/update-kiosk.sh"
# shellcheck source=helpers/assert.sh
. "$HERE/helpers/assert.sh"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/srv" "$tmp/systemd" "$tmp/local" "$tmp/run"

# mock curl: serves $tmp/srv/manifest.json and $tmp/srv/<name>
cat > "$tmp/bin/curl" <<EOF
#!/usr/bin/env bash
for a in "\$@"; do case "\$a" in
  */agent/manifest) cat "$tmp/srv/manifest.json"; exit 0;;
  */agent/files/*) f="\${a##*/}"; [ -f "$tmp/srv/\$f" ] && { cat "$tmp/srv/\$f"; exit 0; };;
esac; done
exit 22
EOF
# mock systemctl: units listed in $tmp/disabled report not-enabled; restart of the
# agent re-creates the readiness marker (healthy new agent).
cat > "$tmp/bin/systemctl" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "$tmp/systemctl.log"
case "\$1" in
  is-enabled) ! grep -qx "\${@: -1}" "$tmp/disabled" 2>/dev/null; exit;;
  enable) sed -i "/^\${@: -1}\$/d" "$tmp/disabled" 2>/dev/null; exit 0;;
  restart) ( sleep 1 && touch "$tmp/run/agent-ready" ) & exit 0;;
esac
exit 0
EOF
chmod +x "$tmp/bin/curl" "$tmp/bin/systemctl"

export CALVIN_BACKEND_URL="http://server.local:8000"
export CALVIN_CURL="$tmp/bin/curl" CALVIN_SYSTEMCTL="$tmp/bin/systemctl"
export CALVIN_SYSTEMD_DIR="$tmp/systemd" CALVIN_BIN_DIR="$tmp/local"
export CALVIN_KIOSK_DISPLAY_ENV_FILE="$tmp/calvin-kiosk-display"
export CALVIN_AGENT_READY_MARKER="$tmp/run/agent-ready" CALVIN_UPDATE_HEALTH_TIMEOUT=4

sha() { sha256sum "$1" | cut -d' ' -f1; }
entry() {  # name target mode restart_unit enable
    printf '{"name":"%s","sha256":"%s","mode":"%s","target_path":"%s","restart_unit":"%s","enable":%s}' \
        "$1" "$(sha "$tmp/srv/$1")" "$3" "$2" "$4" "$5"
}
manifest() {  # version entries...
    local v="$1"; shift
    local IFS=,
    printf '{"version":"%s","min_python":"3.9","files":[%s]}' "$v" "$*" > "$tmp/srv/manifest.json"
}
run() {  # state-dir -> exit status of the updater
    rm -f "$tmp/systemctl.log"
    CALVIN_AGENT_STATE_DIR="$tmp/$1" bash "$SCRIPT" >"$tmp/$1.out" 2>&1
}
printf 'import sys\nsys.exit(0)\n' > "$tmp/srv/calvin_display_agent.py"
printf 'EVIL\n' > "$tmp/srv/calvin-evil.sh"
AGENT="$tmp/local/calvin_display_agent.py"

refuse() {  # case-name expected-state-text entries...
    local name="$1" want="$2"; shift 2
    echo 'print("OLD")' > "$AGENT"
    manifest "${name}00000000000" "$@"
    if run "s_$name"; then fail "$name: updater accepted the manifest"; fi
    grep -q 'print("OLD")' "$AGENT" || fail "$name: changed a file before refusing"
    grep -q "$want" "$tmp/s_$name/agent-update-state.json" || fail "$name: state lacks '$want': $(cat "$tmp/s_$name/agent-update-state.json")"
    pass "$name refused"
}

refuse unknown-file 'not a bundle file' \
    "$(entry calvin_display_agent.py "$AGENT" 0755 calvin-display-agent.service false)" \
    "$(entry calvin-evil.sh "$tmp/local/calvin-evil.sh" 0755 "" false)"
[ ! -e "$tmp/local/calvin-evil.sh" ] || fail "unknown file written"

refuse wrong-target 'not allowed' \
    "$(entry calvin_display_agent.py "$tmp/local/other.py" 0755 calvin-display-agent.service false)"

refuse setuid-mode 'mode' \
    "$(entry calvin_display_agent.py "$AGENT" 4755 calvin-display-agent.service false)"

refuse foreign-unit 'restart unit' \
    "$(entry calvin_display_agent.py "$AGENT" 0755 ssh.service false)"

# --- a disabled enable:true unit is re-enabled although its file is unchanged ---
printf '[Unit]\nDescription=agent\n' > "$tmp/srv/calvin-display-agent.service"
cp "$tmp/srv/calvin-display-agent.service" "$tmp/systemd/calvin-display-agent.service"
cp "$tmp/srv/calvin_display_agent.py" "$AGENT"
echo calvin-display-agent.service > "$tmp/disabled"
manifest reenable0000000 \
    "$(entry calvin_display_agent.py "$AGENT" 0755 calvin-display-agent.service false)" \
    "$(entry calvin-display-agent.service "$tmp/systemd/calvin-display-agent.service" 0644 calvin-display-agent.service true)"
run s_reenable || fail "re-enable run failed: $(cat "$tmp/s_reenable.out")"
assert_contains "$tmp/systemctl.log" '^enable calvin-display-agent.service$' "disabled unit not re-enabled"
assert_contains "$tmp/systemctl.log" '^start calvin-display-agent.service$' "re-enabled unit not started"
pass "disabled unit re-enabled on an otherwise no-op run"

# --- new file + a newer updater that knows it: applied in two passes ---
printf 'EXTRA\n' > "$tmp/srv/calvin-extra.py"
sed 's/calvin_display_agent.py|update-kiosk.sh)/calvin_display_agent.py|update-kiosk.sh|calvin-extra.py)/' "$SCRIPT" > "$tmp/srv/update-kiosk.sh"
grep -q 'calvin-extra.py' "$tmp/srv/update-kiosk.sh" || fail "test could not build the newer updater (pinned table format changed?)"
cp "$SCRIPT" "$tmp/local/update-kiosk.sh"
manifest twopass00000000 \
    "$(entry calvin_display_agent.py "$AGENT" 0755 calvin-display-agent.service false)" \
    "$(entry update-kiosk.sh "$tmp/local/update-kiosk.sh" 0755 "" false)" \
    "$(entry calvin-extra.py "$tmp/local/calvin-extra.py" 0755 "" false)"
run s_twopass || fail "two-pass update failed: $(cat "$tmp/s_twopass.out")"
cmp -s "$tmp/srv/update-kiosk.sh" "$tmp/local/update-kiosk.sh" || fail "newer updater not installed"
assert_contains "$tmp/local/calvin-extra.py" EXTRA "new file not installed by the newer updater"
assert_contains "$tmp/s_twopass/agent-version.json" twopass00000000
pass "unknown file applied by the newer updater it ships with"
