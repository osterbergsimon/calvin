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
#      them; already-satisfied packages are a no-op. Failures only warn.
#   3. Hand ownership of the volume and the venv's directories to
#      PUID:PGID (Unraid appdata is nobody:users = 99:100) so plugin
#      installs keep working as the unprivileged user. Only mismatched
#      paths are touched.
set -eu

DATA_DIR=/var/lib/calvin
VENV=/app/.venv
PUID="${PUID:-0}"
PGID="${PGID:-0}"

umask "${UMASK:-022}"

mkdir -p "$DATA_DIR/db" "$DATA_DIR/images" "$DATA_DIR/plugins" "$DATA_DIR/themes"
cp /app/defaults/themes/builtin.json "$DATA_DIR/themes/builtin.json"

if [ "$(id -u)" = 0 ]; then
    PLUGIN_DIR="${PLUGIN_DIR:-$DATA_DIR/plugins}"

    # One line per plugin: "<id>\t<pkg>\t<pkg>...". Installed one plugin at
    # a time, like the live installer, so one plugin's bad or conflicting
    # requirement doesn't block the others.
    python - "$PLUGIN_DIR" <<'PY' |
import json
import sys
from pathlib import Path

for manifest in sorted(Path(sys.argv[1]).glob("*/plugin.json")):
    try:
        data = json.loads(manifest.read_text(encoding="utf-8"))
        packages = data["dependencies"]["packages"]
    except (OSError, ValueError, KeyError, TypeError):
        continue
    if isinstance(packages, list):
        packages = [p for p in packages if isinstance(p, str) and p.strip()]
        if packages:
            print("\t".join([manifest.parent.name, *packages]))
PY
    while IFS="$(printf '\t')" read -r plugin packages; do
        echo "calvin-entrypoint: restoring packages for plugin $plugin"
        # shellcheck disable=SC2086 # tab-separated list, split on purpose
        (IFS="$(printf '\t')"; UV_NO_CACHE=1 UV_HTTP_TIMEOUT=10 \
            uv pip install --quiet --python "$VENV/bin/python" $packages </dev/null) \
            || echo "calvin-entrypoint: WARNING: could not restore packages for plugin $plugin; it may fail to load" >&2
    done

    if [ "$PUID" != 0 ] || [ "$PGID" != 0 ]; then
        # Re-own what differs: everything under the data and plugin dirs,
        # but only the venv's directories (writable dirs are all a plugin
        # pip install needs; re-owning every file would copy the whole venv
        # into the container layer). Other mounts nested in the data dir
        # (e.g. a photo share mapped under images/) belong to the user and
        # are skipped; mountinfo catches same-filesystem bind mounts that
        # -xdev would miss. Failures (read-only, root-squashed) only warn.
        python - "$PUID" "$PGID" "$DATA_DIR" "$PLUGIN_DIR" "$VENV" <<'PY' \
            || echo "calvin-entrypoint: WARNING: could not fix ownership of all files" >&2
import os
import sys

uid, gid = int(sys.argv[1]), int(sys.argv[2])
data_dirs, venv = sys.argv[3:5], sys.argv[5]
with open("/proc/self/mountinfo", encoding="utf-8") as f:
    mounts = {line.split()[4] for line in f}
failed = 0


def fix(path, follow=False):
    global failed
    try:
        st = os.stat(path, follow_symlinks=follow)
        if (st.st_uid, st.st_gid) != (uid, gid):
            os.chown(path, uid, gid, follow_symlinks=follow)
    except OSError:
        failed += 1


def walk(top, files):
    fix(top, follow=True)
    for root, dirs, names in os.walk(top):
        dirs[:] = [d for d in dirs if os.path.join(root, d) not in mounts]
        for d in dirs:
            fix(os.path.join(root, d))
        if files:
            for n in names:
                fix(os.path.join(root, n))


for top in dict.fromkeys(data_dirs):
    walk(top, files=True)
walk(venv, files=False)
if failed:
    print(f"calvin-entrypoint: WARNING: could not chown {failed} path(s) to {uid}:{gid}", file=sys.stderr)
PY
        # PUID usually has no passwd entry; give tools a writable HOME.
        export HOME=/tmp
        exec setpriv --reuid="$PUID" --regid="$PGID" --clear-groups -- "$@"
    fi
fi

exec "$@"
