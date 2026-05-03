#!/usr/bin/env bash
# Update Calvin.
#
# Production mode pulls the published runtime image. Development mode pulls
# source code into the checkout; hot reload picks up code changes when this
# runs inside the dev container.

set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-/etc/calvin/docker-compose.yml}"
UPDATE_CONFIG="${UPDATE_CONFIG:-/etc/default/calvin-update}"

if [[ -f "$UPDATE_CONFIG" ]]; then
  # shellcheck source=/dev/null
  . "$UPDATE_CONFIG"
fi

CALVIN_MODE="${CALVIN_MODE:-prod}"
REPO_DIR="${REPO_DIR:-/home/calvin/calvin}"
GIT_BRANCH="${GIT_BRANCH:-main}"
WAIT_TIMEOUT="${WAIT_TIMEOUT:-180}"
UPDATE_LOG_FILE="${UPDATE_LOG_FILE:-${REPO_DIR}/backend/logs/calvin-update.log}"
UPDATE_STATE_FILE="${UPDATE_STATE_FILE:-${REPO_DIR}/backend/logs/calvin-update-state.json}"
UPDATE_STARTED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
UPDATE_PHASE="starting"
CURRENT_COMMIT=""
CURRENT_COMMIT_SHORT=""
CURRENT_COMMIT_MSG=""
NEW_COMMIT=""
NEW_COMMIT_SHORT=""
NEW_COMMIT_MSG=""
BACKEND_RESTARTED="false"

json_escape() {
  local s="$1"
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

wait_for_health() {
  UPDATE_PHASE="healthcheck"
  write_update_state "running" "$UPDATE_PHASE" "Waiting for Calvin to become healthy"
  echo "==> Waiting up to ${WAIT_TIMEOUT}s for /api/health to come back"
  local elapsed=0
  while [[ $elapsed -lt $WAIT_TIMEOUT ]]; do
    if curl -fsS http://localhost:8000/api/health >/dev/null 2>&1; then
      echo "Calvin is healthy."
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done

  echo "Calvin did not become healthy within ${WAIT_TIMEOUT}s. Check logs:" >&2
  echo "  docker compose -f $COMPOSE_FILE logs --tail=200" >&2
  return 1
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
else
  if [[ ! -f "$COMPOSE_FILE" ]]; then
    echo "Set COMPOSE_FILE=/path/to/docker-compose.yml or run setup.sh first." >&2
    fail_update "Compose file not found at $COMPOSE_FILE"
  fi

  UPDATE_PHASE="pulling_image"
  write_update_state "running" "$UPDATE_PHASE" "Pulling latest Calvin runtime image"
  echo "==> Pulling latest Calvin runtime image"
  compose -f "$COMPOSE_FILE" pull

  UPDATE_PHASE="restarting"
  write_update_state "running" "$UPDATE_PHASE" "Restarting Calvin"
  echo "==> Restarting Calvin"
  compose -f "$COMPOSE_FILE" up -d
  BACKEND_RESTARTED="true"
fi

wait_for_health
UPDATE_PHASE="complete"
write_update_state "success" "$UPDATE_PHASE" "Update completed successfully"
echo "Update complete!"
