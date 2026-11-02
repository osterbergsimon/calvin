#!/usr/bin/env bash
# P7: apt failures must stop setup (apt is all-or-nothing, so a warning meant X,
# openbox and Chromium were silently skipped), and apt must never prompt
# (noninteractive, keep locally modified config files).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=helpers/assert.sh
. "$HERE/helpers/assert.sh"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
export LOG_FILE="$tmp/setup.log"

# shellcheck source=../setup-common.sh
. "$HERE/../setup-common.sh"

make_stub "$tmp/bin" apt-get "echo \"DEBIAN_FRONTEND=\${DEBIAN_FRONTEND:-} \$*\" >> '$tmp/apt.log'; case \"\${APT_FAIL:-}\" in '') exit 0;; all) exit 1;; esac; [[ \" \$* \" != *\" \$APT_FAIL \"* ]]"
PATH="$tmp/bin:$PATH"

# Success path: flags are passed.
install_system_packages chromium openbox
assert_contains "$tmp/apt.log" '^DEBIAN_FRONTEND=noninteractive .*install -y .*chromium openbox' "install is not noninteractive"
assert_contains "$tmp/apt.log" 'Dpkg::Options::=--force-confold' "install does not keep local config files"
pass "install_system_packages runs noninteractive with --force-confold"

# install failure aborts.
if (APT_FAIL=all install_system_packages chromium) >/dev/null 2>&1; then
    fail "install_system_packages succeeded although apt-get failed"
fi
pass "install_system_packages fails hard"

# upgrade failure aborts too.
if (APT_FAIL=upgrade update_system_packages) >/dev/null 2>&1; then
    fail "update_system_packages succeeded although apt-get failed"
fi
assert_contains "$tmp/apt.log" 'upgrade' "update_system_packages never ran an upgrade"
pass "update_system_packages fails hard"
