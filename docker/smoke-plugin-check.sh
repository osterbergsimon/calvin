#!/bin/sh
# Smoke-test the isolated plugin check inside the runtime image.
#
# Why this exists: in the published image the backend is an *editable* install
# whose .pth points at /build, a directory that does not exist at runtime, so
# `import app` only works because the process cwd is /app. `python -I` drops the
# cwd from sys.path, so a check that relied on it (or on `-m`) would reject every
# plugin install on Docker/Unraid while all tests passed in the dev venv.
#
# It writes a tiny known-good plugin, then calls the real
# run_isolated_plugin_check() from a cwd that is not the backend dir. Run with:
#
#   docker run --rm --entrypoint sh \
#     -v "$PWD/docker/smoke-plugin-check.sh:/smoke.sh:ro" <image> /smoke.sh
set -eu

DATA=/tmp/calvin-smoke
PLUGIN="$DATA/plugins/smoke_plugin"
mkdir -p "$PLUGIN"

cat >"$PLUGIN/plugin.json" <<'JSON'
{"id": "smoke_plugin", "name": "Smoke Plugin", "version": "1.0.0", "type": "service", "api_version": 1}
JSON

cat >"$PLUGIN/plugin.py" <<'PY'
from app.plugins.definitions import PluginMetadata
from app.plugins.protocols import ServicePlugin


class SmokePlugin(ServicePlugin):
    metadata = PluginMetadata(type_id="smoke_plugin", name="Smoke Plugin")
PY

# The parent only needs the backend dir to reach the code under test; the child
# it spawns is what must be independent of the install layout.
cd /tmp
PLUGIN_DIR="$DATA/plugins" CALVIN_DATA_DIR="$DATA/data" python - <<'PY'
import sys

sys.path.insert(0, "/app")
from app.plugins.isolated_check import run_isolated_plugin_check

errors = run_isolated_plugin_check("smoke_plugin")
print("isolated plugin check errors:", errors)
sys.exit(1 if errors else 0)
PY
