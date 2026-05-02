#!/bin/bash
# Compatibility entrypoint for prebuilt Raspberry Pi images.

set -euo pipefail

CALVIN_DIR="${CALVIN_DIR:-/home/calvin/calvin}"
SETUP_SCRIPT="${CALVIN_DIR}/scripts/setup.sh"

if [ ! -f "${SETUP_SCRIPT}" ]; then
    echo "Calvin setup script not found at ${SETUP_SCRIPT}" >&2
    exit 1
fi

exec bash "${SETUP_SCRIPT}" --mode prod "$@"
