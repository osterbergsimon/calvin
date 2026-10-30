"""Persistent on-disk home for plugin pip dependencies (calvin-26c).

The runtime image's venv is replaced whenever the image changes, so packages a
plugin declares under ``dependencies.packages`` would be lost on an image
update and had to be re-installed from the network on every container start.
They live on the data volume instead::

    <data_dir>/python/<major>.<minor>/site-packages

Keying by the interpreter's ``major.minor`` means an image with a new Python
rebuilds the target instead of reusing packages built for the old ABI.

The directory is **appended** to ``sys.path`` — never prepended — so the
interpreter's own site-packages still win: a plugin dependency can shadow
neither the standard library nor a core Calvin dependency (audit BR3).

``docker/entrypoint.sh`` mirrors this layout and the stamp format; keep the two
in sync (``scripts/tests/test_entrypoint_plugin_deps.sh`` pins the shell side).
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

from app.config import settings

# <data_dir>/python — one subdirectory per interpreter version.
PACKAGES_DIRNAME = "python"
SITE_PACKAGES_DIRNAME = "site-packages"
# Next to (not inside) site-packages, so it is never importable.
STAMP_FILENAME = ".plugin-deps"


def python_version_key(version_info: tuple[int, ...] | None = None) -> str:
    """``<major>.<minor>`` of the running interpreter, e.g. ``3.12``.

    Version-keying the target is what makes a base-image Python upgrade safe:
    the new interpreter gets its own directory and the old packages are never
    imported under a different ABI.
    """
    info = sys.version_info if version_info is None else version_info
    return f"{int(info[0])}.{int(info[1])}"


def plugin_packages_root(data_dir: Path | None = None) -> Path:
    """Parent of every per-version plugin package directory."""
    root = settings.data_dir if data_dir is None else Path(data_dir)
    return Path(root) / PACKAGES_DIRNAME


def plugin_packages_dir(data_dir: Path | None = None, version_key: str | None = None) -> Path:
    """The ``site-packages`` target for one interpreter version."""
    key = python_version_key() if version_key is None else version_key
    return plugin_packages_root(data_dir) / key / SITE_PACKAGES_DIRNAME


def dependency_stamp_path(version_key: str | None = None, data_dir: Path | None = None) -> Path:
    """Stamp recording which plugin dependencies the target currently holds."""
    directory = plugin_packages_dir(data_dir, version_key).parent
    return directory / STAMP_FILENAME


def ensure_plugin_packages_dir(target: Path | None = None) -> Path:
    """Create the current version's target (and its parents) and return it."""
    directory = plugin_packages_dir() if target is None else Path(target)
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def ensure_plugin_packages_on_path(target: Path | None = None) -> Path | None:
    """Append the persistent plugin target to ``sys.path``.

    Appending (rather than ``sys.path.insert(0, ...)`` or ``PYTHONPATH``) is
    deliberate: both put the target *ahead* of the interpreter's own
    site-packages, which would let a plugin dependency shadow a core one. If
    the entry was already placed anywhere on the path, it is moved to the end.

    Returns the target when it exists and is now on the path, otherwise None.
    """
    directory = plugin_packages_dir() if target is None else Path(target)
    if not directory.is_dir():
        return None
    entry = str(directory)
    sys.path[:] = [existing for existing in sys.path if existing != entry]
    sys.path.append(entry)
    return directory


def plugin_dependency_lines(plugins_dir: Path | None = None) -> list[str]:
    """One line per installed plugin that declares packages: ``<id>\\t<pkg>...``.

    Reads ``dependencies.packages`` from each ``plugin.json`` exactly like the
    shell scan in ``docker/entrypoint.sh``: sorted by directory name, malformed
    manifests skipped, so both sides hash the same text.
    """
    directory = settings.plugins_dir if plugins_dir is None else Path(plugins_dir)
    lines: list[str] = []
    for manifest_path in sorted(Path(directory).glob("*/plugin.json")):
        try:
            data = json.loads(manifest_path.read_text(encoding="utf-8"))
            packages = data["dependencies"]["packages"]
        except (OSError, ValueError, KeyError, TypeError):
            continue
        if not isinstance(packages, list):
            continue
        wanted = [p for p in packages if isinstance(p, str) and p.strip()]
        if wanted:
            lines.append("\t".join([manifest_path.parent.name, *wanted]))
    return lines


def dependency_stamp(lines: list[str]) -> str:
    """Hash of the dependency set; equal hashes mean the target is current."""
    return hashlib.sha256("\n".join(lines).encode()).hexdigest()


def write_dependency_stamp(plugins_dir: Path | None = None) -> str | None:
    """Record the current dependency set after a successful install/uninstall.

    Called from the live installer so a container restart trusts the target and
    skips the entrypoint's network restore. Returns the digest written, or None
    when this deployment has no persistent target yet (nothing was installed
    into it, so there is no claim to make).
    """
    stamp = dependency_stamp_path()
    if not stamp.parent.is_dir():
        return None
    digest = dependency_stamp(plugin_dependency_lines(plugins_dir))
    stamp.write_text(digest + "\n", encoding="utf-8")
    return digest
