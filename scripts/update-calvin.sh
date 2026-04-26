#!/usr/bin/env bash
# Update Calvin to the latest published runtime image.
#
# Pulls the new image, restarts the compose stack. That's it — no
# native frontend rebuild, no plugin re-extraction, no separate DB
# migration stage. The image bakes the frontend dist; alembic
# migrations run on container start as part of the FastAPI lifespan.
#
# Usage:
#   sudo /opt/calvin/scripts/update-calvin.sh
#
# Override the compose file location with COMPOSE_FILE if you've put
# it somewhere other than /etc/calvin/docker-compose.yml.

set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-/etc/calvin/docker-compose.yml}"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Compose file not found at $COMPOSE_FILE" >&2
  echo "Set COMPOSE_FILE=/path/to/docker-compose.yml or run setup.sh first." >&2
  exit 1
fi

echo "==> Pulling latest Calvin runtime image"
docker compose -f "$COMPOSE_FILE" pull

echo "==> Restarting Calvin"
docker compose -f "$COMPOSE_FILE" up -d

echo "==> Waiting for /api/health to come back"
for _ in $(seq 1 30); do
  if curl -fsS http://localhost:8000/api/health >/dev/null 2>&1; then
    echo "Calvin is healthy."
    exit 0
  fi
  sleep 2
done

echo "Calvin did not become healthy within 60s. Check logs:" >&2
echo "  docker compose -f $COMPOSE_FILE logs --tail=200" >&2
exit 1
