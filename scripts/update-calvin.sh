#!/usr/bin/env bash
# Update Calvin. Runs as root (installed root:root by setup.sh).
#
# Production mode: fast-forwards the host checkout (never over local edits),
# re-installs the host files from it (`setup.sh --refresh`: compose file,
# systemd units, helpers, this script), records the running image, pulls and
# restarts. If the new image does not become healthy, the previous image and
# the previous compose file/.env are put back.
#
# Development mode pulls source code into the checkout; hot reload picks up
# code changes when this runs inside the dev container.

set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-/etc/calvin/docker-compose.yml}"
UPDATE_CONFIG="${UPDATE_CONFIG:-/etc/default/calvin-update}"

if [[ -f "$UPDATE_CONFIG" ]]; then
  # shellcheck source=/dev/null
  . "$UPDATE_CONFIG"
fi

CALVIN_MODE="${CALVIN_MODE:-prod}"
REPO_DIR="${REPO_DIR:-/home/calvin/calvin}"
GIT_BRANCH="${GIT_BRANCH:-develop}"
WAIT_TIMEOUT="${WAIT_TIMEOUT:-180}"
HEALTH_POLL_SECS="${HEALTH_POLL_SECS:-2}"
ENV_FILE="${CALVIN_ENV_FILE:-$(dirname "$COMPOSE_FILE")/.env}"
SETUP_SCRIPT="${CALVIN_SETUP_SCRIPT:-${REPO_DIR}/scripts/setup.sh}"
# auto: refresh when running as root on a host set up by setup.sh (not inside
# the dev container, which has no /etc/calvin compose file).
REFRESH_HOST="${CALVIN_REFRESH_HOST:-auto}"
CONTAINER="${CALVIN_CONTAINER:-calvin}"
UPDATE_LOG_FILE="${UPDATE_LOG_FILE:-${REPO_DIR}/backend/logs/calvin-update.log}"
UPDATE_STATE_FILE="${UPDATE_STATE_FILE:-${REPO_DIR}/backend/logs/calvin-update-state.json}"
UPDATE_STARTED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
ROLLBACK_DIR="$(dirname "$UPDATE_STATE_FILE")/calvin-update-rollback"
UPDATE_PHASE="starting"
CURRENT_COMMIT=""
CURRENT_COMMIT_SHORT=""
CURRENT_COMMIT_MSG=""
NEW_COMMIT=""
NEW_COMMIT_SHORT=""
NEW_COMMIT_MSG=""
BACKEND_RESTARTED="false"
PREVIOUS_IMAGE=""
PREVIOUS_IMAGE_REF=""

json_escape() {
  local s="$1"
  # shellcheck disable=SC1003  # these are literal backslash escapes
  local bs='\\' dq='\"' bb='\b' bf='\f' bn='\n' br='\r' bt='\t'
  s="${s//\\/$bs}"
  s="${s//\"/$dq}"
  s="${s//$'\b'/$bb}"
  s="${s//$'\f'/$bf}"
  s="${s//$'\n'/$bn}"
  s="${s//$'\r'/$br}"
  s="${s//$'\t'/$bt}"
  printf '%s' "$s"
}

_json_field() {
  printf '  "%s": "%s"' "$1" "$(json_escape "$2")"
}

write_update_state() {
  local status="$1"
  local phase="$2"
  local message="$3"
  local error="${4:-}"
  local now finished_at=""

  now="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  if [[ "$status" == "success" || "$status" == "error" ]]; then
    finished_at="$now"
  fi

  local lines=()
  lines+=("$(_json_field status "$status")")
  lines+=("$(_json_field phase "$phase")")
  lines+=("$(_json_field message "$message")")
  lines+=("$(_json_field mode "$CALVIN_MODE")")
  lines+=("$(_json_field branch "$GIT_BRANCH")")
  lines+=("$(_json_field log_file "$UPDATE_LOG_FILE")")
  lines+=("$(_json_field started_at "$UPDATE_STARTED_AT")")
  lines+=("$(_json_field updated_at "$now")")
  [[ -n "$finished_at" ]] && lines+=("$(_json_field finished_at "$finished_at")")
  [[ -n "$CURRENT_COMMIT" ]] && lines+=("$(_json_field current_commit "$CURRENT_COMMIT")")
  [[ -n "$CURRENT_COMMIT_SHORT" ]] && lines+=("$(_json_field current_commit_short "$CURRENT_COMMIT_SHORT")")
  [[ -n "$CURRENT_COMMIT_MSG" ]] && lines+=("$(_json_field current_commit_msg "$CURRENT_COMMIT_MSG")")
  [[ -n "$NEW_COMMIT" ]] && lines+=("$(_json_field new_commit "$NEW_COMMIT")")
  [[ -n "$NEW_COMMIT_SHORT" ]] && lines+=("$(_json_field new_commit_short "$NEW_COMMIT_SHORT")")
  [[ -n "$NEW_COMMIT_MSG" ]] && lines+=("$(_json_field new_commit_msg "$NEW_COMMIT_MSG")")
  [[ -n "$PREVIOUS_IMAGE" ]] && lines+=("$(_json_field previous_image "$PREVIOUS_IMAGE")")
  lines+=("  \"backend_restarted\": $BACKEND_RESTARTED")
  [[ -n "$error" ]] && lines+=("$(_json_field error "$error")")

  mkdir -p "$(dirname "$UPDATE_STATE_FILE")"
  {
    printf '{\n'
    local i last=$((${#lines[@]} - 1))
    for ((i = 0; i <= last; i++)); do
      if (( i < last )); then
        printf '%s,\n' "${lines[i]}"
      else
        printf '%s\n' "${lines[i]}"
      fi
    done
    printf '}\n'
  } >"${UPDATE_STATE_FILE}.tmp"
  mv "${UPDATE_STATE_FILE}.tmp" "$UPDATE_STATE_FILE"
}

capture_current_commit() {
  if [[ -d "$REPO_DIR/.git" ]]; then
    CURRENT_COMMIT="$(git -C "$REPO_DIR" rev-parse HEAD 2>/dev/null || true)"
    CURRENT_COMMIT_SHORT="$(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null || true)"
    CURRENT_COMMIT_MSG="$(git -C "$REPO_DIR" log -1 --pretty=%s 2>/dev/null || true)"
  fi
}

capture_new_commit() {
  if [[ -d "$REPO_DIR/.git" ]]; then
    NEW_COMMIT="$(git -C "$REPO_DIR" rev-parse HEAD 2>/dev/null || true)"
    NEW_COMMIT_SHORT="$(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null || true)"
    NEW_COMMIT_MSG="$(git -C "$REPO_DIR" log -1 --pretty=%s 2>/dev/null || true)"
  fi
}

on_error() {
  local exit_code=$?
  trap - ERR
  write_update_state "error" "$UPDATE_PHASE" "Update failed. Check logs for details." \
    "line ${BASH_LINENO[0]}: ${BASH_COMMAND} exited with ${exit_code}"
  exit "$exit_code"
}

fail_update() {
  trap - ERR
  local message="$1"
  echo "$message" >&2
  write_update_state "error" "$UPDATE_PHASE" "$message" "$message"
  exit 1
}

trap on_error ERR

echo "Starting Calvin update..."
capture_current_commit
write_update_state "running" "$UPDATE_PHASE" "Starting Calvin update"

compose_is_dev() {
  [[ "$CALVIN_MODE" == "dev" ]]
}

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    echo "Neither 'docker compose' nor 'docker-compose' is available." >&2
    return 1
  fi
}

calvin_port() {
  local port=""
  [[ -f "$ENV_FILE" ]] && port="$(grep '^CALVIN_PORT=' "$ENV_FILE" | tail -n 1 | cut -d= -f2- | tr -d "\"'" || true)"
  echo "${port:-8000}"
}

wait_for_health() {
  UPDATE_PHASE="healthcheck"
  write_update_state "running" "$UPDATE_PHASE" "Waiting for Calvin to become healthy"
  local url
  url="http://localhost:$(calvin_port)/api/health"
  echo "==> Waiting up to ${WAIT_TIMEOUT}s for ${url}"
  local deadline=$((SECONDS + WAIT_TIMEOUT))
  while :; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "Calvin is healthy."
      return 0
    fi
    [[ $SECONDS -lt $deadline ]] || break
    sleep "$HEALTH_POLL_SECS"
  done

  echo "Calvin did not become healthy within ${WAIT_TIMEOUT}s. Check logs:" >&2
  echo "  docker compose -f $COMPOSE_FILE logs --tail=200" >&2
  return 1
}

# git in the checkout as its owner, so root never leaves root-owned files there.
repo_git() {
  local owner
  owner="$(stat -c %U "$REPO_DIR" 2>/dev/null || echo root)"
  if [[ $EUID -eq 0 && "$owner" != "root" ]]; then
    sudo -u "$owner" git -C "$REPO_DIR" "$@"
  else
    git -C "$REPO_DIR" "$@"
  fi
}

# Fast-forward only. Local edits or commits are left alone (with a warning):
# the host files then come from the checkout as it is.
update_checkout() {
  [[ -d "$REPO_DIR/.git" ]] || return 0
  UPDATE_PHASE="pulling_code"
  write_update_state "running" "$UPDATE_PHASE" "Updating the host checkout"
  echo "==> Updating checkout $REPO_DIR ($GIT_BRANCH, fast-forward only)"
  if [[ -n "$(repo_git status --porcelain --untracked-files=no)" ]]; then
    echo "WARNING: $REPO_DIR has local changes; not updating it" >&2
    return 0
  fi
  if [[ "$(repo_git rev-parse --abbrev-ref HEAD)" != "$GIT_BRANCH" ]]; then
    echo "WARNING: $REPO_DIR is not on $GIT_BRANCH; not updating it" >&2
    return 0
  fi
  if ! repo_git fetch -q origin "$GIT_BRANCH" || ! repo_git merge -q --ff-only "origin/$GIT_BRANCH"; then
    echo "WARNING: could not fast-forward $REPO_DIR to origin/$GIT_BRANCH; keeping it as it is" >&2
    return 0
  fi
  capture_new_commit
}

should_refresh_host() {
  case "$REFRESH_HOST" in
    1|true) return 0 ;;
    0|false) return 1 ;;
    *) [[ $EUID -eq 0 && -f "$SETUP_SCRIPT" && -f "$COMPOSE_FILE" ]] ;;
  esac
}

# Re-install compose file, units, helper scripts (this one included: setup
# replaces it via a new inode, so this run is unaffected) from the checkout.
refresh_host_files() {
  should_refresh_host || return 0
  UPDATE_PHASE="refreshing_host"
  write_update_state "running" "$UPDATE_PHASE" "Refreshing host files"
  echo "==> Refreshing host files (setup.sh --refresh)"
  mkdir -p "$ROLLBACK_DIR"
  cp -p "$COMPOSE_FILE" "$ROLLBACK_DIR/docker-compose.yml"
  [[ -f "$ENV_FILE" ]] && cp -p "$ENV_FILE" "$ROLLBACK_DIR/.env"
  CALVIN_DIR="$REPO_DIR" bash "$SETUP_SCRIPT" --refresh --mode "$CALVIN_MODE" || fail_update "Refreshing host files failed (setup.sh --refresh)"
}

record_previous_image() {
  PREVIOUS_IMAGE="$(docker inspect --format '{{.Image}}' "$CONTAINER" 2>/dev/null || true)"
  PREVIOUS_IMAGE_REF="$(docker inspect --format '{{.Config.Image}}' "$CONTAINER" 2>/dev/null || true)"
  if [[ -n "$PREVIOUS_IMAGE" ]]; then
    echo "==> Running image: $PREVIOUS_IMAGE_REF ($PREVIOUS_IMAGE)"
    mkdir -p "$ROLLBACK_DIR"
    printf '%s %s\n' "$PREVIOUS_IMAGE" "$PREVIOUS_IMAGE_REF" > "$ROLLBACK_DIR/previous-image"
  fi
}

# Put back the old compose file/.env and the old image under its old tag, then
# restart on it. Always ends the run as an error.
rollback() {
  trap - ERR
  UPDATE_PHASE="rollback"
  write_update_state "running" "$UPDATE_PHASE" "New version unhealthy; rolling back"
  echo "==> New version unhealthy; rolling back" >&2
  [[ -f "$ROLLBACK_DIR/docker-compose.yml" ]] && cp -p "$ROLLBACK_DIR/docker-compose.yml" "$COMPOSE_FILE"
  [[ -f "$ROLLBACK_DIR/.env" ]] && cp -p "$ROLLBACK_DIR/.env" "$ENV_FILE"
  if [[ -z "$PREVIOUS_IMAGE" || -z "$PREVIOUS_IMAGE_REF" ]]; then
    fail_update "Update failed health check and no previous image was recorded to roll back to"
  fi
  docker tag "$PREVIOUS_IMAGE" "$PREVIOUS_IMAGE_REF"
  compose -f "$COMPOSE_FILE" up -d || true
  if wait_for_health; then
    UPDATE_PHASE="rollback"
    fail_update "Update failed health check; rolled back to the previous image (${PREVIOUS_IMAGE_REF})"
  fi
  fail_update "Update failed health check; rolled back to the previous image, which is not healthy either"
}

if compose_is_dev; then
  if [[ ! -d "$REPO_DIR/.git" ]]; then
    fail_update "Dev update requires a git checkout at $REPO_DIR"
  fi

  UPDATE_PHASE="pulling_code"
  write_update_state "running" "$UPDATE_PHASE" "Pulling latest code"
  echo "==> Pulling latest code"
  git -C "$REPO_DIR" fetch origin "$GIT_BRANCH"
  git -C "$REPO_DIR" checkout "$GIT_BRANCH"
  git -C "$REPO_DIR" pull --ff-only --autostash origin "$GIT_BRANCH"
  capture_new_commit
  refresh_host_files

  if [[ -f "$COMPOSE_FILE" ]] && compose version >/dev/null 2>&1; then
    UPDATE_PHASE="restarting"
    write_update_state "running" "$UPDATE_PHASE" "Recreating dev compose stack"
    echo "==> Recreating dev compose stack"
    compose -f "$COMPOSE_FILE" up -d --force-recreate
    BACKEND_RESTARTED="true"
  else
    echo "==> Dev source updated; hot reload will pick up code changes"
    echo "==> Skipping compose recreate because host compose control is unavailable"
  fi
  wait_for_health
else
  if [[ ! -f "$COMPOSE_FILE" ]]; then
    echo "Set COMPOSE_FILE=/path/to/docker-compose.yml or run setup.sh first." >&2
    fail_update "Compose file not found at $COMPOSE_FILE"
  fi

  update_checkout
  refresh_host_files
  record_previous_image

  UPDATE_PHASE="pulling_image"
  write_update_state "running" "$UPDATE_PHASE" "Pulling latest Calvin runtime image"
  echo "==> Pulling latest Calvin runtime image"
  compose -f "$COMPOSE_FILE" pull

  UPDATE_PHASE="restarting"
  write_update_state "running" "$UPDATE_PHASE" "Restarting Calvin"
  echo "==> Restarting Calvin"
  compose -f "$COMPOSE_FILE" up -d
  BACKEND_RESTARTED="true"

  wait_for_health || rollback
fi

UPDATE_PHASE="complete"
write_update_state "success" "$UPDATE_PHASE" "Update completed successfully"
echo "Update complete!"
