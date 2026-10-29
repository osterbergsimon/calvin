#!/usr/bin/env bash
# K4: baked kiosks had no usable admin account (calvin has no password or sudo,
# the Imager user is never created), so the recovery steps in the docs could not
# be run. Boot 1 now gives the baked SSH key to a sudo-capable admin user (not
# to calvin, which runs Chromium) and disables the userconfig first-boot wizard.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=helpers/assert.sh
. "$HERE/helpers/assert.sh"
# shellcheck source=../bake-kiosk-firstrun.sh
source "$HERE/../bake-kiosk-firstrun.sh" --source-only

tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
PUBKEY="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJXs1dE4zJrLBbRjwPl6xuakR4ZGoU1cwgaeaXqM8VrU me@laptop"
echo "$PUBKEY" > "$tmp/id.pub"
touch "$tmp/cmdline.txt"

B="$tmp/bin"
for cmd in useradd usermod passwd chown systemctl; do
    make_stub "$B" "$cmd" "echo \"$cmd \$*\" >> '$tmp/calls.log'"
done
make_stub "$B" id "exit 1"   # admin user does not exist yet
make_stub "$B" visudo "echo \"visudo \$*\" >> '$tmp/calls.log'"

run_step() {  # runs the generated admin/userconfig step against $tmp
    local generated="$1"
    {
        echo "set -euo pipefail"
        printf '%s\n' "$generated" | grep -E '^(SSH_PUBKEY|ADMIN_USER)='
        echo "HOME_ROOT='$tmp/home' SUDOERS_DIR='$tmp/sudoers.d' SSHD_CONF_DIR='$tmp/sshd'"
        printf '%s\n' "$generated" | sed -n '/^# 3b\. /,/^# 4\. /p'
    } > "$tmp/step.sh"
    rm -f "$tmp/calls.log"; mkdir -p "$tmp/sudoers.d" "$tmp/sshd"
    : > "$tmp/sshd/rename_user.conf"
    PATH="$B:$PATH" bash "$tmp/step.sh"
}

parse_args --backend-url http://h:8000 --boot-dir "$tmp" --ssh-pubkey "$tmp/id.pub"
validate_args
run_step "$(emit_firstrun)"
assert_contains "$tmp/calls.log" '^useradd .*-G sudo .*calvin-admin$' "admin user not created in the sudo group"
assert_contains "$tmp/home/calvin-admin/.ssh/authorized_keys" "^${PUBKEY}$"
assert_mode "$tmp/home/calvin-admin/.ssh/authorized_keys" 600
assert_mode "$tmp/home/calvin-admin/.ssh" 700
assert_contains "$tmp/sudoers.d/010_calvin-admin" '^calvin-admin ALL=\(ALL\) NOPASSWD: ALL$'
assert_mode "$tmp/sudoers.d/010_calvin-admin" 440
assert_contains "$tmp/calls.log" '^visudo -c' "admin sudoers fragment not checked with visudo"
assert_contains "$tmp/calls.log" 'passwd -l calvin-admin' "admin password not locked (key-only)"
assert_not_contains "$tmp/calls.log" 'calvin ' "touched the calvin user"
assert_contains "$tmp/calls.log" 'systemctl disable userconfig.service' "userconfig wizard not disabled"
[ ! -e "$tmp/sshd/rename_user.conf" ] || fail "rename_user.conf banner left in place"
pass "baked key goes to a sudo-capable admin; userconfig disabled"

# --admin-user picks the name; bad names are refused.
parse_args --backend-url http://h:8000 --boot-dir "$tmp" --ssh-pubkey "$tmp/id.pub" --admin-user ops
validate_args
run_step "$(emit_firstrun)"
assert_contains "$tmp/home/ops/.ssh/authorized_keys" 'me@laptop'
for bad in calvin root 'a b' 'Ops$'; do
    if ( parse_args --backend-url http://h:8000 --boot-dir "$tmp" --admin-user "$bad"; validate_args ) 2>/dev/null; then
        fail "--admin-user '$bad' accepted"
    fi
done
pass "--admin-user honoured and validated"

# Without a key: no admin user (it could not log in), but userconfig still off.
parse_args --backend-url http://h:8000 --boot-dir "$tmp"
run_step "$(emit_firstrun)"
assert_not_contains "$tmp/calls.log" '^useradd' "admin user created without a key"
assert_contains "$tmp/calls.log" 'systemctl disable userconfig.service'
pass "no key: no admin user"
