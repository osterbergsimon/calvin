#!/usr/bin/env bash
# P9: exactly one thing starts X on tty1. calvin-x.service owns it; setup no
# longer adds getty autologin + `exec startx` in .bash_profile (they raced for
# :0), and re-running setup removes the copies an older setup left behind.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
# shellcheck source=helpers/assert.sh
. "$HERE/helpers/assert.sh"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
export LOG_FILE="$tmp/setup.log"
export CALVIN_HOME_OVERRIDE="$tmp/home"
export CALVIN_SYSTEMD_DIR="$tmp/systemd"
mkdir -p "$tmp/home/calvin" "$tmp/systemd/getty@tty1.service.d"
make_stub "$tmp/bin" systemctl "echo \"\$*\" >> '$tmp/systemctl.log'"
make_stub "$tmp/bin" chown ":"
PATH="$tmp/bin:$PATH"

# What an older setup.sh left behind.
cat > "$tmp/systemd/getty@tty1.service.d/autologin.conf" <<'EOF'
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin calvin --noclear %I $TERM
EOF
cat > "$tmp/home/calvin/.bash_profile" <<'EOF'
if [ -z "$DISPLAY" ] && [ -n "$XDG_VTNR" ] && [ "$XDG_VTNR" -eq 1 ]; then
    exec startx
fi
EOF

# shellcheck source=../setup-common.sh
. "$HERE/../setup-common.sh"
configure_display calvin

[ ! -e "$tmp/systemd/getty@tty1.service.d/autologin.conf" ] || fail "old calvin autologin drop-in left in place"
if [ -e "$tmp/home/calvin/.bash_profile" ]; then
    assert_not_contains "$tmp/home/calvin/.bash_profile" 'startx' ".bash_profile still starts X"
fi
assert_contains "$tmp/home/calvin/.xinitrc" 'openbox-session'
assert_contains "$tmp/systemctl.log" 'disable getty@tty1.service' "getty@tty1 not disabled"
pass "configure_display leaves calvin-x.service as the only X launcher"

# An operator's own autologin (another user) is not ours to delete.
mkdir -p "$tmp/systemd/getty@tty1.service.d"
cat > "$tmp/systemd/getty@tty1.service.d/autologin.conf" <<'EOF'
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin someone --noclear %I $TERM
EOF
configure_display calvin
[ -e "$tmp/systemd/getty@tty1.service.d/autologin.conf" ] || fail "removed an autologin drop-in setup did not write"
pass "foreign autologin drop-in kept"

# The unit itself takes tty1 over from getty and gets a logind session.
unit="$REPO/deploy/systemd/calvin-x.service"
assert_contains "$unit" '^Conflicts=.*getty@tty1\.service' "calvin-x.service does not conflict with getty@tty1"
assert_contains "$unit" '^PAMName=login' "calvin-x.service opens no login session for rootless X"
pass "calvin-x.service owns tty1"
