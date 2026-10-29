#!/usr/bin/env bash
# K7/P5: every sudoers fragment the scripts write is checked with `visudo -c`
# before it lands in /etc/sudoers.d (a broken fragment locks sudo out entirely).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=helpers/assert.sh
. "$HERE/helpers/assert.sh"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
export LOG_FILE="$tmp/setup.log"
export CALVIN_SUDOERS_DIR="$tmp/sudoers.d"
mkdir -p "$CALVIN_SUDOERS_DIR"

# Fake visudo: logs its arguments, rejects any file containing "BROKEN".
make_stub "$tmp/bin" visudo "echo \"\$*\" >> '$tmp/visudo.log'; f=\"\${@: -1}\"; ! grep -q BROKEN \"\$f\""
export CALVIN_VISUDO="$tmp/bin/visudo"

# shellcheck source=../setup-common.sh
. "$HERE/../setup-common.sh"

install_sudoers_fragment calvin-reboot 'calvin ALL=(root) NOPASSWD: /usr/local/bin/reboot-calvin.sh'
assert_contains "$CALVIN_SUDOERS_DIR/calvin-reboot" 'NOPASSWD: /usr/local/bin/reboot-calvin.sh'
assert_mode "$CALVIN_SUDOERS_DIR/calvin-reboot" 440
assert_contains "$tmp/visudo.log" '^-c .*-f ' "visudo -c -f was not run"
pass "valid fragment installed 0440 after visudo -c"

if (install_sudoers_fragment calvin-bad 'BROKEN line') >/dev/null 2>&1; then
    fail "an invalid fragment was accepted"
fi
[ ! -e "$CALVIN_SUDOERS_DIR/calvin-bad" ] || fail "an invalid fragment was written to sudoers.d"
pass "invalid fragment refused and not installed"

# A fragment name with a dot or ~ is silently ignored by sudo's #includedir.
if (install_sudoers_fragment 'calvin.reboot' 'x') >/dev/null 2>&1; then
    fail "a fragment name sudo would ignore was accepted"
fi
pass "fragment names sudo ignores are refused"
