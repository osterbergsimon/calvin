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

echo "Starting Calvin update..."

compose_is_dev() {
  [[ "$CALVIN_MODE" == "dev" ]] || {
    [[ -f "$COMPOSE_FILE" ]] && grep -q "calvin-backend-dev\|calvin-frontend-dev" "$COMPOSE_FILE"
  }
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
  echo "==> Waiting for /api/health to come back"
  for _ in $(seq 1 30); do
    if curl -fsS http://localhost:8000/api/health >/dev/null 2>&1; then
      echo "Calvin is healthy."
      return 0
    fi
    sleep 2
  done

  echo "Calvin did not become healthy within 60s. Check logs:" >&2
  echo "  docker compose -f $COMPOSE_FILE logs --tail=200" >&2
  return 1
}

if compose_is_dev; then
  if [[ ! -d "$REPO_DIR/.git" ]]; then
    echo "Dev update requires a git checkout at $REPO_DIR" >&2
    exit 1
  fi

  echo "==> Pulling latest code"
  git -C "$REPO_DIR" fetch origin "$GIT_BRANCH"
  git -C "$REPO_DIR" checkout "$GIT_BRANCH"
  git -C "$REPO_DIR" pull --ff-only --autostash origin "$GIT_BRANCH"

  if [[ -f "$COMPOSE_FILE" ]] && compose version >/dev/null 2>&1; then
    echo "==> Recreating dev compose stack"
    compose -f "$COMPOSE_FILE" up -d --force-recreate
  else
    echo "==> Dev source updated; hot reload will pick up code changes"
    echo "==> Skipping compose recreate because host compose control is unavailable"
  fi
else
  if [[ ! -f "$COMPOSE_FILE" ]]; then
    echo "Compose file not found at $COMPOSE_FILE" >&2
    echo "Set COMPOSE_FILE=/path/to/docker-compose.yml or run setup.sh first." >&2
    exit 1
  fi

  echo "==> Pulling latest Calvin runtime image"
  compose -f "$COMPOSE_FILE" pull

  echo "==> Restarting Calvin"
  compose -f "$COMPOSE_FILE" up -d
fi

wait_for_health
echo "Update complete!"
