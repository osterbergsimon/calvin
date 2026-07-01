"""Tests for the class-discovery plugin loader.

Complementary to tests/unit/test_plugin_contract.py (which pins discovery
semantics on in-memory modules): this module covers loading installed plugins
from disk via importlib, the api_version gate against real files, unload, and
error bookkeeping.
"""

import json
import sys
from unittest.mock import patch

import pytest

from app.plugins.base import PluginType
from app.plugins.definitions import CURRENT_PLUGIN_API_VERSION
from app.plugins.loader import PluginLoader

_FIXTURE_PLUGIN_PY = '''"""Test installed plugin (contract 1.0)."""
from typing import Any

from app.plugins.definitions import PluginMetadata
from app.plugins.protocols import ServicePlugin


class InstalledFixturePlugin(ServicePlugin):
    metadata = PluginMetadata(
        type_id="{type_id}",
        name="Test Installed Plugin",
        description="Test fixture",
        instance_config_schema={{"url": {{"type": "string", "default": ""}}}},
    )

    async def fetch(self, start_date=None, end_date=None):
        return {{"ok": True}}
'''


@pytest.fixture
def plugin_loader_instance():
    """Create a PluginLoader instance."""
    return PluginLoader()


@pytest.fixture
def make_installed_plugin(tmp_path):
    """Factory writing a real installed-plugin directory (plugin.py + plugin.json)."""

    def _make(plugin_id: str, *, type_id: str | None = None, api_version=CURRENT_PLUGIN_API_VERSION):
        plugin_dir = tmp_path / plugin_id
        plugin_dir.mkdir()
        (plugin_dir / "plugin.py").write_text(
            _FIXTURE_PLUGIN_PY.format(type_id=type_id or plugin_id)
        )
        manifest = {
            "id": plugin_id,
            "name": "Test Plugin",
            "version": "1.0.0",
            "type": "service",
            "api_version": api_version,
        }
        (plugin_dir / "plugin.json").write_text(json.dumps(manifest))
        return manifest, plugin_dir

    return _make


@pytest.fixture(autouse=True)
def _clean_installed_plugin_modules():
    """Drop fixture plugin modules from sys.modules after each test."""
    yield
    for name in [n for n in sys.modules if n.startswith("installed_plugin_test_")]:
        sys.modules.pop(name, None)


@pytest.mark.unit
class TestPluginLoader:
    """Test PluginLoader class."""

    def test_init(self, plugin_loader_instance):
        """Test PluginLoader initialization."""
        assert plugin_loader_instance._loaded_modules == set()
        assert plugin_loader_instance.get_plugin_types() == []

    def test_load_plugins_from_package_discovers_builtins(self, plugin_loader_instance):
        """Loading a built-in package registers its declared plugin classes."""
        plugin_loader_instance.load_plugins_from_package("app.plugins.service")

        assert plugin_loader_instance.get_plugin_class("iframe") is not None
        definitions = {d.type_id: d for d in plugin_loader_instance.get_plugin_types()}
        assert definitions["iframe"].plugin_type == PluginType.SERVICE
        assert definitions["iframe"].plugin_class is plugin_loader_instance.get_plugin_class(
            "iframe"
        )

    def test_load_plugins_from_missing_package_is_safe(self, plugin_loader_instance):
        """A missing package is logged, not raised."""
        plugin_loader_instance.load_plugins_from_package("app.plugins.no_such_package")
        assert plugin_loader_instance.get_plugin_types() == []

    @patch("app.plugins.loader.plugin_installer")
    def test_load_installed_plugins_from_disk(
        self, mock_installer, plugin_loader_instance, make_installed_plugin
    ):
        """An installed plugin's class is imported from plugin.py and registered."""
        manifest, plugin_dir = make_installed_plugin("test_installed")
        mock_installer.get_installed_plugins.return_value = [manifest]
        mock_installer.get_plugin_path.return_value = plugin_dir

        plugin_loader_instance.load_installed_plugins()

        assert "installed_plugin_test_installed" in plugin_loader_instance._loaded_modules
        cls = plugin_loader_instance.get_plugin_class("test_installed")
        assert cls is not None
        assert cls.metadata.type_id == "test_installed"
        assert plugin_loader_instance.get_load_error("test_installed") is None
        assert plugin_loader_instance.installed_plugin_type_ids("test_installed") == {
            "test_installed"
        }

        # Instances come from the standard constructor
        instance = plugin_loader_instance.create_plugin_instance(
            plugin_id="test_installed-1",
            type_id="test_installed",
            name="One",
            config={"enabled": True},
        )
        assert instance is not None
        assert instance.plugin_id == "test_installed-1"
        assert instance.enabled is True

    @patch("app.plugins.loader.plugin_installer")
    def test_load_installed_plugins_skips_wrong_api_version(
        self, mock_installer, plugin_loader_instance, make_installed_plugin
    ):
        """Plugins with a stale/newer api_version are skipped with a recorded error."""
        for plugin_id, api_version in (
            ("test_stale", CURRENT_PLUGIN_API_VERSION - 1),
            ("test_future", CURRENT_PLUGIN_API_VERSION + 1),
        ):
            manifest, plugin_dir = make_installed_plugin(plugin_id, api_version=api_version)
            mock_installer.get_installed_plugins.return_value = [manifest]
            mock_installer.get_plugin_path.return_value = plugin_dir

            plugin_loader_instance.load_installed_plugins()

            assert plugin_loader_instance.get_plugin_class(plugin_id) is None
            assert "api_version" in (plugin_loader_instance.get_load_error(plugin_id) or "")

    @patch("app.plugins.loader.plugin_installer")
    def test_unload_installed_plugin(
        self, mock_installer, plugin_loader_instance, make_installed_plugin
    ):
        """Unloading removes the registered types, module, and load errors."""
        manifest, plugin_dir = make_installed_plugin("test_unload")
        mock_installer.get_installed_plugins.return_value = [manifest]
        mock_installer.get_plugin_path.return_value = plugin_dir

        plugin_loader_instance.load_installed_plugins()
        assert plugin_loader_instance.get_plugin_class("test_unload") is not None
        assert "installed_plugin_test_unload" in sys.modules

        plugin_loader_instance.unload_installed_plugin("test_unload")

        assert plugin_loader_instance.get_plugin_class("test_unload") is None
        assert "installed_plugin_test_unload" not in plugin_loader_instance._loaded_modules
        assert plugin_loader_instance.installed_plugin_type_ids("test_unload") == set()
        assert "installed_plugin_test_unload" not in sys.modules

        # A reinstall can load it again
        plugin_loader_instance.load_installed_plugins()
        assert plugin_loader_instance.get_plugin_class("test_unload") is not None

    @patch("app.plugins.loader.plugin_installer")
    def test_load_installed_plugins_duplicate_type_id_keeps_first(
        self, mock_installer, plugin_loader_instance, make_installed_plugin
    ):
        """Two installed plugins declaring the same type_id: the first wins."""
        manifest_a, dir_a = make_installed_plugin("test_dup_a", type_id="test_dup")
        manifest_b, dir_b = make_installed_plugin("test_dup_b", type_id="test_dup")
        mock_installer.get_installed_plugins.return_value = [manifest_a, manifest_b]
        mock_installer.get_plugin_path.side_effect = lambda pid: {
            "test_dup_a": dir_a,
            "test_dup_b": dir_b,
        }[pid]

        plugin_loader_instance.load_installed_plugins()

        cls = plugin_loader_instance.get_plugin_class("test_dup")
        assert cls is not None
        assert cls.__module__ == "installed_plugin_test_dup_a"
        assert plugin_loader_instance.installed_plugin_type_ids("test_dup_b") == set()

    @patch("app.plugins.loader.plugin_installer")
    def test_load_installed_plugins_missing_plugin_py(
        self, mock_installer, plugin_loader_instance, tmp_path
    ):
        """Test loading installed plugin without plugin.py."""
        plugin_dir = tmp_path / "test_missing"
        plugin_dir.mkdir()

        mock_installer.get_installed_plugins.return_value = [
            {"id": "test_missing", "api_version": CURRENT_PLUGIN_API_VERSION},
        ]
        mock_installer.get_plugin_path.return_value = plugin_dir

        # Should not raise an error, just skip
        plugin_loader_instance.load_installed_plugins()
        assert "installed_plugin_test_missing" not in plugin_loader_instance._loaded_modules

    @patch("app.plugins.loader.plugin_installer")
    def test_load_installed_plugins_error_handling(
        self, mock_installer, plugin_loader_instance, tmp_path
    ):
        """Import errors are recorded as load errors, not raised."""
        plugin_dir = tmp_path / "test_broken"
        plugin_dir.mkdir()
        (plugin_dir / "plugin.py").write_text("invalid python code !!!")

        mock_installer.get_installed_plugins.return_value = [
            {"id": "test_broken", "api_version": CURRENT_PLUGIN_API_VERSION},
        ]
        mock_installer.get_plugin_path.return_value = plugin_dir

        # Should not raise an error, just log and continue
        plugin_loader_instance.load_installed_plugins()

        assert plugin_loader_instance.get_plugin_class("test_broken") is None
        assert plugin_loader_instance.get_load_error("test_broken") is not None

    @patch("app.plugins.loader.plugin_installer")
    def test_load_installed_plugins_no_plugin_class(
        self, mock_installer, plugin_loader_instance, tmp_path
    ):
        """A plugin.py without a metadata-declaring class registers nothing."""
        plugin_dir = tmp_path / "test_empty"
        plugin_dir.mkdir()
        (plugin_dir / "plugin.py").write_text("# No plugin class here\n")

        mock_installer.get_installed_plugins.return_value = [
            {"id": "test_empty", "api_version": CURRENT_PLUGIN_API_VERSION},
        ]
        mock_installer.get_plugin_path.return_value = plugin_dir

        plugin_loader_instance.load_installed_plugins()

        assert "installed_plugin_test_empty" not in plugin_loader_instance._loaded_modules
        assert plugin_loader_instance.get_plugin_types() == []

    @patch("app.plugins.loader.plugin_installer")
    def test_load_all_plugins(self, mock_installer, plugin_loader_instance):
        """Test loading all plugins (built-in and installed)."""
        mock_installer.get_installed_plugins.return_value = []

        with patch.object(plugin_loader_instance, "load_plugins_from_package") as mock_load_package:
            with patch.object(
                plugin_loader_instance, "load_installed_plugins"
            ) as mock_load_installed:
                plugin_loader_instance.load_all_plugins()

                # Verify built-in packages are loaded
                assert mock_load_package.call_count == 3
                assert mock_load_installed.called
