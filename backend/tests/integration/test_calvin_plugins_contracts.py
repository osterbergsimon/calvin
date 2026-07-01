"""Contract test: every plugin in the sibling calvin-plugins repo must conform
to plugin contract 1.0 — a manifest with the current api_version and a module
that registers at least one declarative plugin class with the loader.

This catches plugin breakage in host CI before the plugin reaches a user's Pi
(where validation failures show up as failed installs and missing dashboard
regions).

The test discovers calvin-plugins via:
  1. CALVIN_PLUGINS_DIR environment variable, if set
  2. <repo_root>/../calvin-plugins (the conventional sibling layout)

If neither resolves, the test is skipped — checkouts that don't include the
plugins repo (e.g. minimal CI shards) are fine.
"""

from __future__ import annotations

import importlib.util
import json
import os
import sys
from pathlib import Path

import pytest

from app.plugins.definitions import CURRENT_PLUGIN_API_VERSION
from app.plugins.loader import PluginLoader


def _find_calvin_plugins_dir() -> Path | None:
    env = os.environ.get("CALVIN_PLUGINS_DIR")
    if env:
        candidate = Path(env).expanduser().resolve()
        return candidate if candidate.is_dir() else None
    # backend/tests/integration/this_file.py -> backend -> repo root -> ../calvin-plugins
    repo_root = Path(__file__).resolve().parents[3]
    candidate = (repo_root.parent / "calvin-plugins").resolve()
    return candidate if candidate.is_dir() else None


PLUGINS_DIR = _find_calvin_plugins_dir()


def _discover_plugin_modules() -> list[tuple[str, Path]]:
    """Return (plugin_id, plugin_py_path) pairs for every plugin in the repo."""
    if PLUGINS_DIR is None:
        return []
    found: list[tuple[str, Path]] = []
    for plugin_py in sorted(PLUGINS_DIR.glob("*/plugin.py")):
        plugin_id = plugin_py.parent.name
        found.append((plugin_id, plugin_py))
    return found


PLUGIN_MODULES = _discover_plugin_modules()

require_plugins_repo = pytest.mark.skipif(
    PLUGINS_DIR is None,
    reason="calvin-plugins sibling repo not found; set CALVIN_PLUGINS_DIR to enable",
)


@pytest.mark.integration
@require_plugins_repo
@pytest.mark.skipif(
    not PLUGIN_MODULES,
    reason="calvin-plugins repo present but contains no plugins",
)
@pytest.mark.parametrize(
    "plugin_id,plugin_py",
    PLUGIN_MODULES,
    ids=[pid for pid, _ in PLUGIN_MODULES],
)
def test_plugin_conforms_to_contract(plugin_id: str, plugin_py: Path) -> None:
    """Manifest declares the current api_version; the module registers a class."""
    manifest_path = plugin_py.parent / "plugin.json"
    assert manifest_path.exists(), f"{plugin_id}: plugin.json missing"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    api_version = manifest.get("api_version")
    assert api_version == CURRENT_PLUGIN_API_VERSION, (
        f"{plugin_id}: plugin.json must declare api_version "
        f"{CURRENT_PLUGIN_API_VERSION} (got {api_version!r})"
    )
    for retired in ("format_version", "protocol_version", "python_dependencies"):
        assert retired not in manifest, f"{plugin_id}: retired manifest key '{retired}'"

    module_name = f"_calvin_plugins_contract_test.{plugin_id}"
    spec = importlib.util.spec_from_file_location(module_name, plugin_py)
    assert spec is not None and spec.loader is not None, f"could not load {plugin_py}"
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    try:
        spec.loader.exec_module(module)
    except ModuleNotFoundError as exc:
        # Plugins with pip deps (dependencies.packages) may not be importable
        # in the host venv; that's an install-time concern, not a contract one.
        packages = (manifest.get("dependencies") or {}).get("packages", [])
        if packages:
            pytest.skip(f"{plugin_id}: optional dependency not installed here: {exc.name}")
        pytest.fail(f"{plugin_id}: failed to import plugin.py: {exc!r}")
    except Exception as exc:  # noqa: BLE001 - we want to surface any import failure
        pytest.fail(f"{plugin_id}: failed to import plugin.py: {exc!r}")

    # No module-level hooks in 1.0.
    for retired_hook in (
        "register_plugin_types",
        "create_plugin_instance",
        "handle_plugin_config_update",
    ):
        assert not hasattr(module, retired_hook), (
            f"{plugin_id}: plugin.py defines retired hook {retired_hook}()"
        )

    loader = PluginLoader()
    registered = loader.register_module(module)
    assert registered, (
        f"{plugin_id}: plugin.py declares no plugin class "
        "(a BasePlugin subclass with a `metadata = PluginMetadata(...)` attribute)"
    )
    assert manifest["id"] in registered, (
        f"{plugin_id}: manifest id {manifest['id']!r} not among registered "
        f"type_ids {registered}"
    )

    # Runtime fields resolve for every registered type.
    for definition in loader.get_plugin_types():
        assert definition.plugin_class is not None
        assert definition.plugin_type is not None
        assert definition.plugin_type.value == manifest["type"], (
            f"{plugin_id}: manifest type {manifest['type']!r} does not match "
            f"family {definition.plugin_type.value!r}"
        )
