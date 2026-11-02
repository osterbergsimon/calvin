#!/bin/bash
# Verify the canonical Docker-based update script is installed.
# Run this on a Calvin host after setup.

set -e

CALVIN_USER="${CALVIN_USER:-calvin}"
EXPECTED_SCRIPT="/usr/local/bin/update-calvin.sh"
COMPOSE_FILE="${COMPOSE_FILE:-/etc/calvin/docker-compose.yml}"

echo "=========================================="
echo "Testing Calvin Update Script Installation"
echo "=========================================="
echo ""

if [ -f "$EXPECTED_SCRIPT" ]; then
    echo "✓ Update script exists: $EXPECTED_SCRIPT"
    ls -lh "$EXPECTED_SCRIPT"
else
    echo "✗ Update script missing: $EXPECTED_SCRIPT"
    echo "  Re-run setup or install scripts/update-calvin.sh to $EXPECTED_SCRIPT."
    exit 1
fi
echo ""

if [ -x "$EXPECTED_SCRIPT" ]; then
    echo "✓ Update script is executable"
else
    echo "✗ Update script is not executable"
    echo "  Fix with: sudo chmod +x $EXPECTED_SCRIPT"
    exit 1
fi
echo ""

if [ -f "$COMPOSE_FILE" ]; then
    echo "✓ Compose file exists: $COMPOSE_FILE"
else
    echo "✗ Compose file missing: $COMPOSE_FILE"
    echo "  Set COMPOSE_FILE=/path/to/docker-compose.yml if you use a custom location."
    exit 1
fi
echo ""

echo "Testing Docker Compose configuration..."
if docker compose -f "$COMPOSE_FILE" config >/dev/null; then
    echo "✓ Docker Compose configuration is valid"
else
    echo "✗ Docker Compose configuration failed validation"
    echo "  Ensure the compose env_file exists. From a checkout, copy deploy/calvin.env.example to deploy/calvin.env."
    exit 1
fi
echo ""

echo "=========================================="
echo "Summary"
echo "=========================================="
echo "User: ${CALVIN_USER}"
echo "Script: $EXPECTED_SCRIPT"
echo "Compose file: $COMPOSE_FILE"
echo ""
echo "To test the update script manually:"
echo "  sudo -u ${CALVIN_USER} COMPOSE_FILE=$COMPOSE_FILE $EXPECTED_SCRIPT"
echo ""
