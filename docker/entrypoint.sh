#!/bin/sh
# Calvin container entrypoint.
#
# Runs as root, prepares the data volume, then drops to PUID:PGID (when
# set) before exec'ing the server. Steps:
#
#   1. Make sure the data layout exists and refresh the image-owned
#      built-in themes file. /app/data is a symlink to the data volume,
#      so every relative ./data/... write the backend does (installed
#      themes, caches) lands on the volume too.
#   2. Re-install plugin pip dependencies. Plugins live on the volume,
#      but their packages go into the image's venv, which is replaced
#      whenever the container is recreated (image update). Reading
#      dependencies.packages from each installed plugin.json restores
#      them; already-satisfied packages are a no-op.
#   3. Hand ownership of the volume and the venv to PUID:PGID (Unraid
#      appdata is nobody:users = 99:100) so plugin installs keep working
#      as the unprivileged user. Only mismatched paths are touched.
set -eu

DATA_DIR=/var/lib/calvin
VENV=/app/.venv
PUID="${PUID:-0}"
PGID="${PGID:-0}"

umask "${UMASK:-022}"

mkdir -p "$DATA_DIR/db" "$DATA_DIR/images" "$DATA_DIR/plugins" "$DATA_DIR/themes"
cp /app/defaults/themes/builtin.json "$DATA_DIR/themes/builtin.json"

if [ "$(id -u)" = 0 ]; then
    plugin_packages=$(python - "${PLUGIN_DIR:-$DATA_DIR/plugins}" <<'PY'
import json
import sys
from pathlib import Path

packages = set()
for manifest in sorted(Path(sys.argv[1]).glob("*/plugin.json")):
    try:
        data = json.loads(manifest.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        continue
    packages.update((data.get("dependencies") or {}).get("packages") or [])
print("\n".join(sorted(packages)))
PY
    )
    if [ -n "$plugin_packages" ]; then
        echo "calvin-entrypoint: restoring plugin packages: $(echo "$plugin_packages" | tr '\n' ' ')"
        echo "$plugin_packages" | UV_NO_CACHE=1 xargs -d '\n' uv pip install --quiet --python "$VENV/bin/python" \
            || echo "calvin-entrypoint: WARNING: could not restore all plugin packages; affected plugins may fail to load" >&2
    fi

    if [ "$PUID" != 0 ] || [ "$PGID" != 0 ]; then
        for dir in "$DATA_DIR" "$VENV"; do
            find "$dir" \( ! -user "$PUID" -o ! -group "$PGID" \) -exec chown -h "$PUID:$PGID" {} +
        done
        # PUID usually has no passwd entry; give tools a writable HOME.
        export HOME=/tmp
        exec setpriv --reuid="$PUID" --regid="$PGID" --clear-groups -- "$@"
    fi
fi

exec "$@"
