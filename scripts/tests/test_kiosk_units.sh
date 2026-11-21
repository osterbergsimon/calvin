#!/usr/bin/env bash
# P5: Chromium ran with --no-sandbox (and --no-zygote, which requires it), so one
# renderer exploit from plugin/iframe content ran with calvin's full rights.
# P9: the all-in-one kiosk unit hard-coded port 8000; it now reads CALVIN_PORT
# from /etc/calvin/.env.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
# shellcheck source=helpers/assert.sh
. "$HERE/helpers/assert.sh"

for unit in calvin-kiosk.service calvin-kiosk-remote.service; do
    f="$REPO/deploy/systemd/$unit"
    assert_not_contains "$f" '--no-sandbox' "$unit still disables the Chromium sandbox"
    assert_not_contains "$f" '--no-zygote' "$unit still passes --no-zygote (only valid with --no-sandbox)"
done
pass "Chromium sandbox enabled in both kiosk units"

f="$REPO/deploy/systemd/calvin-kiosk.service"
assert_contains "$f" '^EnvironmentFile=-/etc/calvin/\.env$' "calvin-kiosk.service does not read /etc/calvin/.env"
assert_not_contains "$f" 'localhost:8000' "calvin-kiosk.service still hard-codes port 8000"
assert_contains "$f" 'localhost:\$\{CALVIN_PORT:-8000\}' "calvin-kiosk.service does not use CALVIN_PORT"
pass "calvin-kiosk.service uses CALVIN_PORT"

# The all-in-one display has no ?kiosk= id, so the page is told it is a kiosk
# for link handling (calvin-eugy): links there must never navigate the wall.
assert_contains "$f" '/\?display=kiosk"' "calvin-kiosk.service does not mark the display as a kiosk for links"
pass "calvin-kiosk.service marks its display for kiosk link handling"

# The generated openbox autostart (Chromium-launching variant) too.
assert_not_contains "$REPO/scripts/setup-common.sh" 'localhost:8000/api/health' "openbox autostart hard-codes port 8000"
pass "openbox autostart has no hard-coded port"

# Every launcher tells the page its display has no tabs or back button. A registered
# kiosk carries ?kiosk=<id>; one without an id falls back to ?display=kiosk, so a
# link can never strand the wall (calvin-eugy). The URL applies on the next kiosk
# restart.
for unit in calvin-cog.service calvin-kiosk-remote.service; do
    assert_contains "$REPO/deploy/systemd/$unit" 'else q="display=kiosk"' "$unit has no display=kiosk fallback when CALVIN_KIOSK_ID is unset"
done
assert_contains "$REPO/scripts/setup-common.sh" '/\?display=kiosk &' "openbox autostart does not mark the display as a kiosk"
pass "every kiosk launcher marks its display for kiosk link handling"

# --- the pairing secret in the start URL's fragment (calvin-0xns) -----------
# Both browsers read the agent's 0600 secret file when they build the start URL
# and append it ONLY after '#'. A missing or malformed file adds nothing, so a
# garbled file can never inject shell code or a query parameter.
credential="$tmp/kiosk-credential"
good_secret="clv_kiosk_$(printf 'A%.0s' $(seq 1 43))"

unit_start_url() {  # $1 unit file; prints the URL the browser would open
    local unit="$1" body
    body="$(python3 - "$unit" <<'PY'
import re, sys
text = open(sys.argv[1]).read()
match = re.search(r"^ExecStart=/bin/bash -c '(.*)'$", text, re.M | re.S)
if not match:
    raise SystemExit("no ExecStart=/bin/bash -c '...' in " + sys.argv[1])
print(match.group(1))
PY
)"
    # systemd's own escapes, then replace the browser with a printer of its URL.
    body="$(printf '%s\n' "$body" | sed -e 's/\$\$/$/g' -e 's/%%/%/g' \
        -e "s|/usr/bin/chromium|printf 'URL:%s\\\\n'|" \
        -e "s|exec /usr/bin/cog|printf 'URL:%s\\\\n'|")"
    CALVIN_BACKEND_URL="http://tower.local:8000" \
    CALVIN_KIOSK_ID="kitchen" CALVIN_KIOSK_HOSTNAME="pi" \
    CALVIN_KIOSK_CREDENTIAL_FILE="$credential" \
        bash -c "$body" 2>/dev/null | tail -n 1 | sed 's/^URL://'
}

printf '%s\n' "$good_secret" > "$credential"
chmod 600 "$credential"
for unit in calvin-kiosk-remote.service calvin-cog.service; do
    url="$(unit_start_url "$REPO/deploy/systemd/$unit")"
    case "$url" in
        "http://tower.local:8000/?kiosk=kitchen&khost=pi#pair=$good_secret"|\
        "http://tower.local:8000?kiosk=kitchen&khost=pi#pair=$good_secret") ;;
        *) fail "$unit start URL is not the kiosk URL with #pair=<secret>: $url" ;;
    esac
    [ "${url#*#pair=}" = "$good_secret" ] || fail "$unit fragment is not the secret"
    case "${url%%#*}" in
        *clv_kiosk_*) fail "$unit puts the secret before '#'" ;;
    esac
done
pass "both kiosk units append the secret only as #pair="

# Missing file, a shell-metacharacter payload, and an embedded newline: no fragment.
rm -f "$credential"
for unit in calvin-kiosk-remote.service calvin-cog.service; do
    url="$(unit_start_url "$REPO/deploy/systemd/$unit")"
    case "$url" in *"#pair="*) fail "$unit added a fragment without a secret file" ;; esac
done
printf "%s\n" "clv_kiosk_x' ; rm -rf /" > "$credential"
for unit in calvin-kiosk-remote.service calvin-cog.service; do
    url="$(unit_start_url "$REPO/deploy/systemd/$unit")"
    case "$url" in *"#pair="*) fail "$unit accepted a malformed secret" ;; esac
done
printf '%s\nEVIL\n' "$good_secret" > "$credential"
for unit in calvin-kiosk-remote.service calvin-cog.service; do
    url="$(unit_start_url "$REPO/deploy/systemd/$unit")"
    case "$url" in *"#pair="*) fail "$unit accepted a secret file with an extra line" ;; esac
done
pass "a missing or malformed credential adds no fragment"

# No new sudo rule: pairing restarts the browser by signalling it, as the crash
# watchdog already does. The one installed fragment is byte-for-byte unchanged.
[ "$(sha256sum "$REPO/deploy/kiosk-agent/calvin-kiosk-update.sudoers" | cut -d' ' -f1)" = \
  "044251ea34fc81207a343d70be50d67cd507f961c8fa1535b6cfbdba06fb98d7" ] \
    || fail "the kiosk updater sudoers fragment changed"
for script in "$REPO/deploy/kiosk-agent/install-kiosk.sh" \
              "$REPO/scripts/setup-kiosk.sh" \
              "$REPO/scripts/bake-kiosk-firstrun.sh"; do
    if grep -qiE 'sudoers.*pair|pair.*sudoers' "$script"; then
        fail "$(basename "$script") installs a pairing sudo rule"
    fi
done
pass "pairing adds no sudo rule"
