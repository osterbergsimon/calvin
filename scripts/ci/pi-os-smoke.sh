#!/usr/bin/env bash
# CI smoke test for the Raspberry Pi install path on a fresh Debian release
# (P2). Run as root inside a plain debian:<suite> container, ideally arm64:
#
#   docker run --rm -v "$PWD:/calvin:ro" debian:bookworm bash /calvin/scripts/ci/pi-os-smoke.sh
#
# It runs setup.sh's real install_docker_runtime (Docker CE + compose plugin
# from download.docker.com) and checks that every kiosk package setup.sh and
# setup-kiosk.sh install exists in the suite. No daemon is needed: the check is
# that `docker compose` is installed and works as a client.
set -euo pipefail

REPO="${1:-/calvin}"
export LOG_FILE=/tmp/calvin-smoke.log
export DEBIAN_FRONTEND=noninteractive

. /etc/os-release
echo "== ${PRETTY_NAME} ($(dpkg --print-architecture))"

apt-get update -qq

# shellcheck source=../setup.sh
. "${REPO}/scripts/setup.sh" --source-only

echo "== install_docker_runtime"
install_docker_runtime
docker --version
docker compose version

echo "== kiosk packages resolve: ${CALVIN_KIOSK_PACKAGES[*]} git cron unattended-upgrades"
apt-get install -s -qq "${CALVIN_KIOSK_PACKAGES[@]}" git cron unattended-upgrades >/dev/null

echo "== compose file validates"
mkdir -p /tmp/calvin-etc
cp "${REPO}/docker/docker-compose.yml" /tmp/calvin-etc/docker-compose.yml
cp "${REPO}/deploy/calvin.env.example" /tmp/calvin-etc/.env
docker compose -f /tmp/calvin-etc/docker-compose.yml config >/dev/null

echo "== OK: ${PRETTY_NAME}"
