#!/usr/bin/env bash
# P3/P9: update-calvin.sh used to pull the image and nothing else: host files
# (compose file, units, sudo helpers, the script itself) went stale, a failed
# health check left the broken image running, and the health URL hard-coded
# port 8000. Now it:
#   - fast-forwards the checkout (never over local edits),
#   - refreshes the host files with setup.sh --refresh run from a fresh
#     root-owned clone of GIT_REPO/GIT_BRANCH (never from the calvin-owned
#     checkout: root must not run or install code the app user can edit),
#   - keeps its rollback copies in a root-only state dir, cleared every run,
#   - remembers the running image and rolls back image + compose/.env when the
#     refresh, the pull, the restart or the health check (on CALVIN_PORT) fails,
#     always ending with an error state.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$HERE/../update-calvin.sh"
# shellcheck source=helpers/assert.sh
. "$HERE/helpers/assert.sh"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t
export GIT_CONFIG_GLOBAL=/dev/null

# --- origin: its scripts/setup.sh is the trusted refresh ------------------------
git init -q -b develop "$tmp/origin"
mkdir -p "$tmp/origin/scripts"
cat > "$tmp/origin/scripts/setup.sh" <<EOF
echo "setup-from-origin \$* CALVIN_DIR=\${CALVIN_DIR:-} SRC=\${CALVIN_SOURCE_DIR:-} PWD=\$PWD" >> "$tmp/calls.log"
[ ! -f "$tmp/refresh-fails" ] || { echo BROKEN-COMPOSE > "$tmp/etc/docker-compose.yml"; exit 1; }
echo "NEW-COMPOSE" > "$tmp/etc/docker-compose.yml"
EOF
echo v1 > "$tmp/origin/file"; git -C "$tmp/origin" add -A; git -C "$tmp/origin" commit -qm v1
git clone -q "$tmp/origin" "$tmp/repo"
git -C "$tmp/origin" commit -qm v2 --allow-empty

# --- host layout ---------------------------------------------------------------
mkdir -p "$tmp/etc" "$tmp/state"
reset_host() {
    echo "OLD-COMPOSE" > "$tmp/etc/docker-compose.yml"
    printf 'CALVIN_PORT=8123\nCALVIN_IMAGE_TAG=develop\n' > "$tmp/etc/.env"
    rm -f "$tmp/calls.log" "$tmp/unhealthy" "$tmp/rolled-back" "$tmp/refresh-fails" "$tmp/pull-fails" "$tmp/up-fails"
}
printf 'CALVIN_MODE=prod\nREPO_DIR=%s\nGIT_BRANCH=develop\nGIT_REPO=%s\n' "$tmp/repo" "$tmp/origin" > "$tmp/calvin-update"

B="$tmp/bin"
make_stub "$B" docker "echo \"docker \$*\" >> '$tmp/calls.log'
case \"\$*\" in
  'inspect --format {{.Image}} calvin') echo sha256:0ld1mage;;
  'inspect --format {{.Config.Image}} calvin') echo ghcr.io/osterbergsimon/calvin:develop;;
  'tag '*) touch '$tmp/rolled-back';;
  *' pull') [ ! -f '$tmp/pull-fails' ];;
  *' up -d') [ ! -f '$tmp/up-fails' ] || [ -f '$tmp/rolled-back' ];;
esac"
# Health fails while \$tmp/unhealthy exists, unless the old image was put back.
make_stub "$B" curl "echo \"curl \$*\" >> '$tmp/calls.log'
[ ! -f '$tmp/unhealthy' ] || [ -f '$tmp/rolled-back' ]"
PATH="$B:$PATH"

export UPDATE_CONFIG="$tmp/calvin-update" COMPOSE_FILE="$tmp/etc/docker-compose.yml"
export CALVIN_REFRESH_HOST=1 CALVIN_UPDATE_DIR="$tmp/update-root"
export UPDATE_STATE_FILE="$tmp/state/update-state.json" UPDATE_LOG_FILE="$tmp/state/update.log"
export WAIT_TIMEOUT=1 HEALTH_POLL_SECS=0.1
state() { grep -oE "\"$1\": \"[^\"]*\"" "$UPDATE_STATE_FILE" | cut -d'"' -f4; }

# --- 1. healthy update; a tampered checkout script is never run -----------------
reset_host
echo 'echo EVIL >> '"$tmp/calls.log" > "$tmp/repo/scripts/setup.sh"   # local edit by the app user
bash "$SCRIPT" > "$tmp/out1" 2>&1 || fail "healthy update failed: $(cat "$tmp/out1")"
assert_contains "$tmp/calls.log" "^setup-from-origin --refresh --mode prod CALVIN_DIR=$tmp/repo SRC=$tmp/update-root/src PWD=/$" "refresh not run from the root-owned origin clone"
assert_not_contains "$tmp/calls.log" 'EVIL' "ran setup.sh from the app user's checkout as root"
assert_eq 'echo EVIL >> '"$tmp/calls.log" "$(cat "$tmp/repo/scripts/setup.sh")" "update wiped a local edit in the checkout"
assert_mode "$tmp/update-root" 700
assert_contains "$tmp/calls.log" 'curl .*http://localhost:8123/api/health' "health check ignores CALVIN_PORT"
assert_eq success "$(state status)"
assert_eq sha256:0ld1mage "$(state previous_image)" "previous image not recorded"
assert_not_contains "$tmp/calls.log" '^docker tag' "rolled back a healthy update"
pass "healthy update: refresh from origin clone, health on CALVIN_PORT, previous image recorded"

# --- 2. clean checkout is fast-forwarded ----------------------------------------
git -C "$tmp/repo" checkout -q -- scripts/setup.sh
reset_host
bash "$SCRIPT" > "$tmp/out2" 2>&1 || fail "update failed: $(cat "$tmp/out2")"
assert_eq "$(git -C "$tmp/origin" rev-parse HEAD)" "$(git -C "$tmp/repo" rev-parse HEAD)" "clean checkout not fast-forwarded"
assert_eq "$(git -C "$tmp/origin" rev-parse --short HEAD)" "$(state new_commit_short)" "new commit not recorded"
pass "clean checkout fast-forwarded"

# --- 3. failure modes: each one ends as an error with the old host files back ---
expect_rollback() {  # name trigger-file expect-image-rollback(1/0)
    reset_host; touch "$tmp/$2"
    if bash "$SCRIPT" > "$tmp/out-$1" 2>&1; then fail "$1: update reported success"; fi
    assert_eq OLD-COMPOSE "$(cat "$tmp/etc/docker-compose.yml")" "$1: compose file not restored"
    assert_eq error "$(state status)" "$1: final state is not error: $(cat "$UPDATE_STATE_FILE")"
    if [ "$3" = 1 ]; then
        assert_contains "$tmp/calls.log" '^docker tag sha256:0ld1mage ghcr.io/osterbergsimon/calvin:develop$' "$1: previous image not restored"
        assert_contains "$UPDATE_STATE_FILE" 'rolled back' "$1: state does not say it rolled back"
    fi
    pass "$1 -> rolled back, error state"
}
expect_rollback unhealthy unhealthy 1
expect_rollback up-fails up-fails 1
expect_rollback pull-fails pull-fails 0
expect_rollback refresh-fails refresh-fails 0

# --- 4. rollback copies never come from an earlier run --------------------------
reset_host
CALVIN_REFRESH_HOST=0 bash "$SCRIPT" > "$tmp/out4" 2>&1 || fail "no-refresh update failed"
echo "OPERATOR-EDIT" > "$tmp/etc/docker-compose.yml"
touch "$tmp/unhealthy"
CALVIN_REFRESH_HOST=0 bash "$SCRIPT" > "$tmp/out5" 2>&1 && fail "unhealthy update reported success"
assert_eq OPERATOR-EDIT "$(cat "$tmp/etc/docker-compose.yml")" "restored a compose file saved by an earlier run"
pass "rollback copies are per run"

# --- 5. a host that still records the retired default GIT_BRANCH=main ----------
# main is release-only (no compose file or units, no :latest image): update
# from develop instead of failing to fetch or installing main's files.
reset_host
sed -i 's/^GIT_BRANCH=develop$/GIT_BRANCH=main/' "$tmp/calvin-update"
bash "$SCRIPT" > "$tmp/out6" 2>&1 || fail "update with recorded main failed: $(cat "$tmp/out6")"
assert_contains "$tmp/calls.log" '^setup-from-origin --refresh' "host files not refreshed from develop"
assert_contains "$tmp/out6" 'release-only' "no note that main was replaced"
assert_eq develop "$(state branch)"
sed -i 's/^GIT_BRANCH=main$/GIT_BRANCH=develop/' "$tmp/calvin-update"
pass "recorded main updates from develop"

# --- 6. default state/log live outside the app user's checkout ---------------
# update-calvin.sh runs as root; a state file in REPO_DIR/backend/logs lets the
# app user plant a symlink for root to follow (calvin-1g25).
reset_host
(
    unset UPDATE_STATE_FILE UPDATE_LOG_FILE
    export CALVIN_UPDATE_DIR="$tmp/update-default"
    export CALVIN_UPDATE_STATUS_DIR="$tmp/update-status"
    bash "$SCRIPT" > "$tmp/out7" 2>&1 || { cat "$tmp/out7" >&2; exit 1; }
)
new_state="$tmp/update-status/calvin-update-state.json"
[ -f "$new_state" ] || fail "update state not written under the root-owned update-status dir"
assert_mode "$tmp/update-status" 755
assert_eq success "$(grep -oE '"status": "[^"]*"' "$new_state" | cut -d'"' -f4)" "default run did not finish"
[ ! -e "$tmp/repo/backend/logs/calvin-update-state.json" ] || fail "update state written inside the app user's checkout"
assert_mode "$tmp/update-default" 700
pass "default update state lives outside the checkout"

# --- 7. a symlink planted at the fixed temp name is replaced, not followed ----
reset_host
victim="$tmp/victim"; printf 'VICTIM\n' > "$victim"
rm -f "$UPDATE_STATE_FILE" "${UPDATE_STATE_FILE}.tmp"
ln -s "$victim" "${UPDATE_STATE_FILE}.tmp"   # the old code wrote through this
bash "$SCRIPT" > "$tmp/out8" 2>&1 || fail "update failed with a planted symlink: $(cat "$tmp/out8")"
assert_eq VICTIM "$(cat "$victim")" "root wrote through a symlink planted at <state>.tmp"
[ ! -L "$UPDATE_STATE_FILE" ] || fail "state file is still a symlink"
assert_eq success "$(state status)"
pass "planted state temp symlink not followed"
