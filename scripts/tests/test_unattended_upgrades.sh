#!/usr/bin/env bash
# P9: nothing updated the OS or Chromium. Setup now enables unattended-upgrades,
# including the Raspberry Pi archive (where RPi OS's Chromium comes from).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=helpers/assert.sh
. "$HERE/helpers/assert.sh"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
export LOG_FILE="$tmp/setup.log"
export CALVIN_APT_CONF_DIR="$tmp/apt.conf.d"
make_stub "$tmp/bin" apt-get "echo \"\$*\" >> '$tmp/apt.log'"
PATH="$tmp/bin:$PATH"

# shellcheck source=../setup-common.sh
. "$HERE/../setup-common.sh"
configure_unattended_upgrades

assert_contains "$tmp/apt.log" 'install .*unattended-upgrades' "unattended-upgrades not installed"
assert_contains "$tmp/apt.conf.d/20auto-upgrades" 'APT::Periodic::Update-Package-Lists "1";'
assert_contains "$tmp/apt.conf.d/20auto-upgrades" 'APT::Periodic::Unattended-Upgrade "1";'
origins="$tmp/apt.conf.d/52calvin-unattended-upgrades"
assert_contains "$origins" 'origin=Raspberry Pi Foundation' "Raspberry Pi archive (Chromium) not included"
assert_contains "$origins" 'origin=Raspbian' "Raspbian archive (32-bit RPi OS) not included"
pass "unattended-upgrades enabled incl. the Raspberry Pi archive"
