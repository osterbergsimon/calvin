#!/bin/bash
# Compatibility wrapper for the old development setup entrypoint.
# The compose-based setup script owns both prod and dev modes now.

set -euo pipefail

_ENV_GIT_BRANCH="${GIT_BRANCH:-}"
_ENV_GIT_REPO="${GIT_REPO:-https://github.com/osterbergsimon/calvin.git}"
_SCRIPT_DIR=""

if [ -n "${BASH_SOURCE[0]:-}" ] && [ "${BASH_SOURCE[0]}" != "-" ]; then
    _SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

if [ -n "${_SCRIPT_DIR}" ] && [ -f "${_SCRIPT_DIR}/setup.sh" ]; then
    exec bash "${_SCRIPT_DIR}/setup.sh" --mode dev "$@"
fi

GIT_BRANCH="${_ENV_GIT_BRANCH:-${GIT_BRANCH:-main}}"
repo_owner=$(echo "${_ENV_GIT_REPO}" | sed -E 's|.*github\.com[:/]([^/]+)/([^/]+)(\.git)?$|\1|')
repo_name=$(echo "${_ENV_GIT_REPO}" | sed -E 's|.*github\.com[:/]([^/]+)/([^/]+)(\.git)?$|\2|' | sed 's|\.git$||')

if [ -z "${repo_owner}" ] || [ -z "${repo_name}" ]; then
    echo "Error: Could not extract repo owner/name from ${_ENV_GIT_REPO}" >&2
    exit 1
fi

setup_url="https://raw.githubusercontent.com/${repo_owner}/${repo_name}/${GIT_BRANCH}/scripts/setup.sh"

if command -v curl >/dev/null 2>&1; then
    curl -fsSL "${setup_url}" | GIT_REPO="${_ENV_GIT_REPO}" GIT_BRANCH="${GIT_BRANCH}" bash -s -- --mode dev "$@"
elif command -v wget >/dev/null 2>&1; then
    wget -qO- "${setup_url}" | GIT_REPO="${_ENV_GIT_REPO}" GIT_BRANCH="${GIT_BRANCH}" bash -s -- --mode dev "$@"
else
    echo "Error: Neither curl nor wget is available. Please install one of them." >&2
    exit 1
fi
