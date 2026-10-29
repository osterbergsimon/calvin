#!/usr/bin/env bash
# P2: setup.sh installed docker.io and then docker-compose-plugin/-v2, which do
# not exist in the Debian or Raspberry Pi OS Bookworm repos, so a fresh Pi ended
# with "Docker Compose is not available". It now installs docker-ce + the compose
# plugin from download.docker.com. P5: calvin is no longer put in (and is taken
# out of) the docker group, which is root-equivalent.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=helpers/assert.sh
. "$HERE/helpers/assert.sh"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
export LOG_FILE="$tmp/setup.log"
export CALVIN_OS_RELEASE="$tmp/os-release"
export CALVIN_APT_KEYRINGS_DIR="$tmp/keyrings"
export CALVIN_APT_SOURCES_DIR="$tmp/sources.list.d"

B="$tmp/bin"
# docker: `compose version` works only once the plugin has been "installed".
make_stub "$B" docker "echo \"docker \$*\" >> '$tmp/calls.log'; [ \"\$1 \$2\" = 'compose version' ] && { [ -f '$tmp/compose-installed' ] || exit 1; }; exit 0"
make_stub "$B" apt-get "echo \"apt-get \$*\" >> '$tmp/calls.log'; case \" \$* \" in *' docker-compose-plugin '*) touch '$tmp/compose-installed';; esac; exit 0"
# dpkg: docker.io is installed (an old setup's leftover); --print-architecture -> arm64
make_stub "$B" dpkg "case \"\$1\" in --print-architecture) echo arm64;; -s) [ \"\$2\" = docker.io ];; esac"
make_stub "$B" curl "echo \"curl \$*\" >> '$tmp/calls.log'; case \"\$*\" in *raspbian/dists/trixie/*) exit 22;; esac; while [ \$# -gt 0 ]; do [ \"\$1\" = -o ] && echo KEY > \"\$2\"; shift; done"
make_stub "$B" systemctl "echo \"systemctl \$*\" >> '$tmp/calls.log'"
make_stub "$B" usermod "echo \"usermod \$*\" >> '$tmp/calls.log'"
make_stub "$B" gpasswd "echo \"gpasswd \$*\" >> '$tmp/calls.log'"
make_stub "$B" id "[ \"\$1\" = -nG ] && { echo 'calvin video docker'; exit 0; }; exec /usr/bin/env -i PATH=/usr/bin:/bin:/run/current-system/sw/bin id \"\$@\""
PATH="$B:$PATH"

# shellcheck source=../setup.sh
. "$HERE/../setup.sh" --source-only

run_case() {  # os_id codename
    rm -f "$tmp/calls.log" "$tmp/compose-installed"; rm -rf "$tmp/keyrings" "$tmp/sources.list.d"
    printf 'ID=%s\nVERSION_CODENAME=%s\n' "$1" "$2" > "$CALVIN_OS_RELEASE"
    install_docker_runtime > "$tmp/run.out" 2>&1
}

run_case debian bookworm
src="$tmp/sources.list.d/docker.list"
assert_contains "$src" "^deb \[arch=arm64 signed-by=$tmp/keyrings/docker.asc\] https://download.docker.com/linux/debian bookworm stable$"
assert_contains "$tmp/calls.log" 'curl .*https://download.docker.com/linux/debian/gpg'
assert_contains "$tmp/calls.log" 'apt-get .*remove .*docker.io' "conflicting docker.io not removed first"
assert_contains "$tmp/calls.log" 'apt-get .*install .*docker-ce .*docker-ce-cli .*containerd.io .*docker-compose-plugin'
assert_not_contains "$tmp/calls.log" 'install .* docker.io' "still installs docker.io"
assert_not_contains "$tmp/calls.log" 'usermod .*docker' "calvin still added to the docker group"
assert_contains "$tmp/calls.log" 'gpasswd -d calvin docker' "calvin not taken out of the docker group"
pass "Debian Bookworm: docker-ce + compose plugin from download.docker.com"

run_case debian trixie
assert_contains "$src" 'linux/debian trixie stable$'
pass "Debian Trixie repo line"

run_case raspbian bookworm
assert_contains "$src" 'https://download.docker.com/linux/raspbian bookworm stable$'
pass "32-bit Raspberry Pi OS uses the raspbian repo"

# Docker ships no 32-bit (raspbian) Trixie packages: say so instead of an apt error.
if (run_case raspbian trixie); then fail "32-bit Trixie accepted"; fi
grep -q '64-bit' "$tmp/run.out" || fail "32-bit Trixie error does not point to 64-bit Raspberry Pi OS: $(cat "$tmp/run.out")"
pass "32-bit Trixie refused with a clear message"

if (run_case fedora 40) >/dev/null 2>&1; then fail "unsupported OS accepted"; fi
pass "unsupported OS refused"

# Already working (e.g. a re-run): leave Docker alone.
touch "$tmp/compose-installed"; rm -f "$tmp/calls.log"
printf 'ID=debian\nVERSION_CODENAME=bookworm\n' > "$CALVIN_OS_RELEASE"
install_docker_runtime >/dev/null
assert_not_contains "$tmp/calls.log" 'apt-get' "re-installed Docker although compose already works"
pass "working Docker left alone"

# The unit uses the path docker-ce installs.
assert_contains "$HERE/../../deploy/systemd/calvin-app.service" '^ExecStart=/usr/bin/docker compose '
pass "calvin-app.service uses /usr/bin/docker"
