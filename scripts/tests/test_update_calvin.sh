#!/usr/bin/env bash
# P3/P9: update-calvin.sh used to pull the image and nothing else: host files
# (compose file, units, sudo helpers, the script itself) went stale, a failed
# health check left the broken image running, and the health URL hard-coded
# port 8000. Now it fast-forwards the checkout (never over local edits),
# refreshes the host files via `setup.sh --refresh`, remembers the running
# image, and rolls back to it (and to the old compose/.env) when the new one
# does not become healthy on CALVIN_PORT.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$HERE/../update-calvin.sh"
# shellcheck source=helpers/assert.sh
. "$HERE/helpers/assert.sh"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t
export GIT_CONFIG_GLOBAL=/dev/null

# --- a checkout with an upstream commit waiting, and a local edit ---------
git init -q -b develop "$tmp/origin"
echo v1 > "$tmp/origin/file"; git -C "$tmp/origin" add file; git -C "$tmp/origin" commit -qm v1
git clone -q "$tmp/origin" "$tmp/repo"
git -C "$tmp/origin" commit -qm v2 --allow-empty

# --- host layout -----------------------------------------------------------
mkdir -p "$tmp/etc" "$tmp/state"
echo "OLD-COMPOSE" > "$tmp/etc/docker-compose.yml"
printf 'CALVIN_PORT=8123\nCALVIN_IMAGE_TAG=develop\n' > "$tmp/etc/.env"
printf 'CALVIN_MODE=prod\nREPO_DIR=%s\nGIT_BRANCH=develop\n' "$tmp/repo" > "$tmp/calvin-update"
cat > "$tmp/setup.sh" <<EOF
echo "setup \$*" >> "$tmp/calls.log"
echo "NEW-COMPOSE" > "$tmp/etc/docker-compose.yml"
EOF

B="$tmp/bin"
make_stub "$B" docker "echo \"docker \$*\" >> '$tmp/calls.log'
case \"\$*\" in
  'inspect --format {{.Image}} calvin') echo sha256:0ld1mage;;
  'inspect --format {{.Config.Image}} calvin') echo ghcr.io/osterbergsimon/calvin:develop;;
  'tag '*) touch '$tmp/rolled-back';;
esac
exit 0"
# Health fails while \$tmp/unhealthy exists, unless the old image was put back.
make_stub "$B" curl "echo \"curl \$*\" >> '$tmp/calls.log'
[ ! -f '$tmp/unhealthy' ] || [ -f '$tmp/rolled-back' ]"
PATH="$B:$PATH"

export UPDATE_CONFIG="$tmp/calvin-update" COMPOSE_FILE="$tmp/etc/docker-compose.yml"
export CALVIN_SETUP_SCRIPT="$tmp/setup.sh" CALVIN_REFRESH_HOST=1
export UPDATE_STATE_FILE="$tmp/state/update-state.json" UPDATE_LOG_FILE="$tmp/state/update.log"
export WAIT_TIMEOUT=1 HEALTH_POLL_SECS=0.1

# --- 1. healthy update --------------------------------------------------------
echo "local edit" > "$tmp/repo/file"
bash "$SCRIPT" > "$tmp/out1" 2>&1 || fail "healthy update failed: $(cat "$tmp/out1")"
assert_eq "local edit" "$(cat "$tmp/repo/file")" "update wiped a local edit in the checkout"
assert_contains "$tmp/calls.log" '^setup --refresh' "host files not refreshed"
assert_contains "$tmp/calls.log" 'curl .*http://localhost:8123/api/health' "health check ignores CALVIN_PORT"
assert_contains "$tmp/calls.log" 'docker compose -f .* pull'
assert_contains "$UPDATE_STATE_FILE" '"status": "success"'
assert_contains "$UPDATE_STATE_FILE" '"previous_image": "sha256:0ld1mage"' "previous image not recorded"
assert_not_contains "$tmp/calls.log" '^docker tag' "rolled back a healthy update"
pass "healthy update: refresh, pull, health on CALVIN_PORT, previous image recorded"

# --- 2. clean checkout is fast-forwarded --------------------------------------
git -C "$tmp/repo" checkout -q -- file
bash "$SCRIPT" > "$tmp/out2" 2>&1 || fail "update failed: $(cat "$tmp/out2")"
assert_eq "$(git -C "$tmp/origin" rev-parse HEAD)" "$(git -C "$tmp/repo" rev-parse HEAD)" "clean checkout not fast-forwarded"
pass "clean checkout fast-forwarded"

# --- 3. unhealthy update rolls back -------------------------------------------
rm -f "$tmp/calls.log"; echo "OLD-COMPOSE" > "$tmp/etc/docker-compose.yml"
touch "$tmp/unhealthy"
if bash "$SCRIPT" > "$tmp/out3" 2>&1; then fail "unhealthy update reported success"; fi
assert_contains "$tmp/calls.log" '^docker tag sha256:0ld1mage ghcr.io/osterbergsimon/calvin:develop$' "previous image not restored"
assert_eq "OLD-COMPOSE" "$(cat "$tmp/etc/docker-compose.yml")" "compose file not restored"
[ "$(grep -c 'compose -f .* up -d' "$tmp/calls.log")" -ge 2 ] || fail "stack not restarted on the old image"
assert_contains "$UPDATE_STATE_FILE" '"status": "error"'
assert_contains "$UPDATE_STATE_FILE" 'rolled back' "state does not say it rolled back"
pass "failed health check rolls back to the previous image and host files"
