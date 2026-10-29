"""Validate one installed plugin in a fresh interpreter.

Run by :mod:`app.plugins.isolated_check` as::

    python -I -m app.plugins.check_plugin <plugin_dir>

It imports ``plugin.py`` through the same seam the loader uses for installed
plugins (``app.plugins.loader.import_plugin_module``) and runs the same class
discovery/registration, then prints exactly one JSON line::

    {"errors": [...], "type_ids": [...]}

Plugin failures — including ``sys.exit()`` — are reported in ``errors``; the
process still exits 0 so the parent reads them from the payload. A non-zero
exit means the check itself could not run. No database is touched.
"""

import json
import sys
from pathlib import Path

from app.plugins.loader import PluginLoader, import_plugin_module


def _plugin_id(plugin_dir: Path) -> str:
    """The id the loader will use: the manifest's, falling back to the dir name."""
    manifest_path = plugin_dir / "plugin.json"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return plugin_dir.name
    if isinstance(manifest, dict):
        manifest_id = manifest.get("id")
        if isinstance(manifest_id, str) and manifest_id:
            return manifest_id
    return plugin_dir.name


def check_plugin_dir(plugin_dir: Path) -> dict[str, list[str]]:
    """Import ``plugin.py`` the way the loader will and report what happened."""
    plugin_py = plugin_dir / "plugin.py"
    if not plugin_py.is_file():
        return {"errors": [f"plugin.py not found in {plugin_dir}"], "type_ids": []}

    plugin_id = _plugin_id(plugin_dir)
    loader = PluginLoader()
    type_ids: list[str] = []
    try:
        module = import_plugin_module(plugin_id, plugin_dir, f"installed_plugin_{plugin_id}")
        type_ids = loader.register_module(module)
    except SystemExit as exc:
        return {"errors": [f"SystemExit: {exc}"], "type_ids": []}
    except BaseException as exc:  # noqa: BLE001 - a plugin must not take the check down
        return {"errors": [f"{type(exc).__name__}: {exc}"], "type_ids": []}

    errors: list[str] = []
    if not type_ids:
        errors.append(
            "plugin.py does not declare a plugin class "
            "(a BasePlugin subclass with a `metadata = PluginMetadata(...)` attribute)."
        )
    return {"errors": errors, "type_ids": type_ids}


def main(argv: list[str] | None = None) -> int:
    """Entry point: one argv path in, one JSON line out."""
    args = sys.argv[1:] if argv is None else argv
    if len(args) != 1:
        print(
            json.dumps(
                {
                    "errors": ["usage: python -m app.plugins.check_plugin <plugin_dir>"],
                    "type_ids": [],
                }
            )
        )
        return 2

    print(json.dumps(check_plugin_dir(Path(args[0]))))
    return 0


if __name__ == "__main__":
    sys.exit(main())
