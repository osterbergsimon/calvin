#!/bin/sh
# Calvin container entrypoint.
#
# Runs as root, prepares the data volume, then drops to PUID:PGID (when
# set) before exec'ing the server. Steps:
#
#   1. Make sure the data layout exists. The backend derives every path
#      it writes from CALVIN_DATA_DIR, so all of it lands on the volume.
#   2. Make sure the persistent plugin package target for this Python
#      version is present and current. Plugin packages live on the data
#      volume (python/<major>.<minor>/site-packages), not in the image's
#      venv, which is replaced whenever the container is recreated (image
#      update). A stamp of the installed plugins' dependencies marks the
#      target as current, so a normal start does no network work and works
#      offline. Only when the target is missing, corrupt or stale — or when
#      the image moved to another Python minor version — is it restored
#      here as a fallback. See backend/app/services/plugin_packages.py and
#      calvin-26c.
#   3. As root, hand ownership of the volume (which now includes that
#      target) to PUID:PGID (Unraid appdata is nobody:users = 99:100) so
#      plugin installs keep working as the unprivileged user, then drop
#      privileges. Only mismatched paths are touched.
set -eu

DATA_DIR="${CALVIN_DATA_DIR:-/var/lib/calvin}"
VENV=/app/.venv
PUID="${PUID:-0}"
PGID="${PGID:-0}"

# Keyed by the interpreter's major.minor: a base image with a different
# Python gets its own target instead of importing packages built for the
# old ABI. The backend mirrors this layout (plugin_packages.py).
PLUGIN_DEPS_PYTHON="$(python -c 'import sys; print("%d.%d" % sys.version_info[:2])')"
PLUGIN_DEPS_DIR="$DATA_DIR/python/$PLUGIN_DEPS_PYTHON/site-packages"
PLUGIN_DEPS_STAMP="$DATA_DIR/python/$PLUGIN_DEPS_PYTHON/.plugin-deps"

umask "${UMASK:-022}"

mkdir -p "$DATA_DIR/db" "$DATA_DIR/images" "$DATA_DIR/plugins" "$DATA_DIR/themes"

PLUGIN_DIR="${PLUGIN_DIR:-$DATA_DIR/plugins}"

# One line per plugin: "<id>\t<pkg>\t<pkg>...". Installed one plugin at
# a time, like the live installer, so one plugin's bad or conflicting
# requirement doesn't block the others.
PLUGIN_DEPS="$(python - "$PLUGIN_DIR" <<'PY'
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
)"

if [ -z "$PLUGIN_DEPS" ]; then
    echo "calvin-entrypoint: no plugin packages declared; nothing to restore"
else
    # Same hash the backend writes after a live install/uninstall, so a
    # plugin installed in the running container is not reinstalled here.
    PLUGIN_DEPS_HASH="$(printf '%s' "$PLUGIN_DEPS" | sha256sum | cut -d' ' -f1)"
    if [ "$(cat "$PLUGIN_DEPS_STAMP" 2>/dev/null || true)" = "$PLUGIN_DEPS_HASH" ] &&
        [ -d "$PLUGIN_DEPS_DIR" ] &&
        ls "$PLUGIN_DEPS_DIR"/*.dist-info >/dev/null 2>&1; then
        echo "calvin-entrypoint: plugin packages for Python $PLUGIN_DEPS_PYTHON are current"
    else
        echo "calvin-entrypoint: restoring plugin packages into $PLUGIN_DEPS_DIR"
        mkdir -p "$PLUGIN_DEPS_DIR"
        PLUGIN_DEPS_LIST="$(mktemp)"
        printf '%s\n' "$PLUGIN_DEPS" >"$PLUGIN_DEPS_LIST"
        deps_failed=0
        while IFS="$(printf '\t')" read -r plugin packages; do
            [ -n "$plugin" ] || continue
            echo "calvin-entrypoint: restoring packages for plugin $plugin"
            # shellcheck disable=SC2086 # tab-separated list, split on purpose
            (IFS="$(printf '\t')"; UV_NO_CACHE=1 UV_HTTP_TIMEOUT=10 \
                uv pip install --quiet --target "$PLUGIN_DEPS_DIR" \
                --python "$VENV/bin/python" $packages </dev/null) ||
                {
                    echo "calvin-entrypoint: WARNING: could not restore packages for plugin $plugin; it may fail to load" >&2
                    deps_failed=1
                }
        done <"$PLUGIN_DEPS_LIST"
        rm -f "$PLUGIN_DEPS_LIST"
        # Only claim the target is current when every plugin installed.
        # Otherwise the next start retries (a missing package on an offline
        # start is a warning, not a broken container).
        if [ "$deps_failed" = 0 ]; then
            printf '%s\n' "$PLUGIN_DEPS_HASH" >"$PLUGIN_DEPS_STAMP"
        fi
    fi
fi

if [ "$(id -u)" = 0 ] && { [ "$PUID" != 0 ] || [ "$PGID" != 0 ]; }; then
    # Re-own what differs: everything under the data and plugin dirs, but
    # only the venv's directories (writable dirs are all a plugin pip
    # install needs; re-owning every file would copy the whole venv into
    # the container layer). Other mounts nested in the data dir (e.g. a
    # photo share mapped under images/) belong to the user and are skipped;
    # mountinfo catches same-filesystem bind mounts that -xdev would miss.
    # Failures (read-only, root-squashed) only warn.
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

exec "$@"
