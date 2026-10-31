#!/usr/bin/env bash
# CLV-62: an install can pin a release tag. A vX.Y.Z ref is a release, not a
# branch: the image tag follows the ref (vX.Y.Z instead of :develop), and a
# checkout that tracks a tag is switched to that tag instead of being
# fast-forwarded like a branch. develop stays the default for testers, and an
# explicit operator pin (CALVIN_IMAGE_TAG) still wins over both.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=helpers/assert.sh
. "$HERE/helpers/assert.sh"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
export LOG_FILE="$tmp/setup.log"
export CALVIN_DEFAULT_DIR="$tmp/etc-default" CALVIN_ETC_DIR="$tmp/etc-calvin"
mkdir -p "$CALVIN_DEFAULT_DIR" "$CALVIN_ETC_DIR"

# setup.sh sources setup-common.sh from its own directory.
# shellcheck source=../setup.sh
. "$HERE/../setup.sh" --source-only

# --- 1. refs: a release tag, not a branch --------------------------------------
is_release_tag v0.1.0 || fail "v0.1.0 is not recognised as a release tag"
is_release_tag v12.3.4-rc.1 || fail "a pre-release tag is not recognised"
is_release_tag develop && fail "develop is not a release tag"
is_release_tag main && fail "main is not a release tag"
is_release_tag v1 && fail "v1 is not a release-please tag"
pass "release tags are told apart from branches"

assert_eq v0.1.0 "$(image_tag_for_branch v0.1.0)" "a release install did not follow the tag"
assert_eq v1.2.3-rc.1 "$(image_tag_for_branch v1.2.3-rc.1)" "a pre-release install did not follow the tag"
assert_eq develop "$(image_tag_for_branch develop)" "develop no longer runs :develop"
assert_eq develop "$(image_tag_for_branch main)" "main must not deploy :latest"
pass "image tag follows the release ref; branches keep :develop"

# --- 2. sync_image_tag keeps the .env in step ----------------------------------
env_file="$CALVIN_ETC_DIR/.env"
printf 'CALVIN_PORT=8000\nCALVIN_IMAGE_TAG=develop\n' > "$env_file"
sync_image_tag "$env_file" v0.1.0 >/dev/null
assert_eq v0.1.0 "$(read_env_value "$env_file" CALVIN_IMAGE_TAG)" "a release install kept :develop"

# A newer tag moves the install; release tags are managed, not operator pins.
sync_image_tag "$env_file" v0.2.0 >/dev/null
assert_eq v0.2.0 "$(read_env_value "$env_file" CALVIN_IMAGE_TAG)" "a newer release tag was not picked up"
pass "a release install follows its tag, and upgrades to a newer one"

# --- 3. an operator pin on a branch install is kept ----------------------------
printf 'CALVIN_IMAGE_TAG=v0.2.0\n' > "$env_file"
sync_image_tag "$env_file" develop >/dev/null
assert_eq v0.2.0 "$(read_env_value "$env_file" CALVIN_IMAGE_TAG)" "an operator pin was overwritten by develop"
printf 'CALVIN_IMAGE_TAG=latest\n' > "$env_file"
sync_image_tag "$env_file" develop >/dev/null
assert_eq develop "$(read_env_value "$env_file" CALVIN_IMAGE_TAG)" ":latest did not follow the deploy branch"
pass "operator pins survive; managed values follow the branch"

# An explicit CALVIN_IMAGE_TAG wins over the ref it is installed from.
printf 'CALVIN_IMAGE_TAG=develop\n' > "$env_file"
CALVIN_IMAGE_TAG=v0.1.0 sync_image_tag "$env_file" v0.2.0 >/dev/null
assert_eq v0.1.0 "$(read_env_value "$env_file" CALVIN_IMAGE_TAG)" "an explicit CALVIN_IMAGE_TAG did not win"
pass "explicit CALVIN_IMAGE_TAG wins over the ref"

# --- 4. a checkout that tracks a tag is switched, not fast-forwarded -----------
# `sudo -u <user> git` runs git as the current user here: the real path only
# differs by dropping privileges.
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t
export GIT_CONFIG_GLOBAL=/dev/null
make_stub "$tmp/bin" sudo 'shift 2; exec "$@"'
PATH="$tmp/bin:$PATH"

git init -q -b develop "$tmp/origin"
echo v1 > "$tmp/origin/file"
git -C "$tmp/origin" add -A
git -C "$tmp/origin" commit -qm v1
git -C "$tmp/origin" tag v0.1.0
echo v2 > "$tmp/origin/file"
git -C "$tmp/origin" commit -qam v2
git -C "$tmp/origin" tag v0.2.0
git -c advice.detachedHead=false clone -q --branch v0.1.0 "$tmp/origin" "$tmp/checkout"

ensure_git_repo "$tmp/origin" v0.1.0 "$tmp/checkout" "$(id -un)" >/dev/null 2>&1 \
    || fail "re-running setup on a tag checkout failed"
assert_eq v0.1.0 "$(git -C "$tmp/checkout" describe --tags --exact-match)" "the checkout left its tag"
pass "a tag checkout is kept on its tag"

ensure_git_repo "$tmp/origin" v0.2.0 "$tmp/checkout" "$(id -un)" >/dev/null 2>&1 \
    || fail "moving a tag checkout to a newer tag failed"
assert_eq v0.2.0 "$(git -C "$tmp/checkout" describe --tags --exact-match)" "the checkout did not move to the newer tag"
assert_eq v2 "$(cat "$tmp/checkout/file")" "the checkout has the wrong tree for v0.2.0"
pass "a tag checkout moves to a newer tag"
