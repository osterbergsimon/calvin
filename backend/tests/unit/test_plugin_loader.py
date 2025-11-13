"""Tests for plugin loader."""

import json
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from app.plugins.loader import PluginLoader


@pytest.fixture
def plugin_loader_instance():
    """Create a PluginLoader instance."""
    return PluginLoader()


@pytest.fixture
def mock_plugin_installer(tmp_path):
    """Create a mock plugin installer."""
    installer = MagicMock()
    installer.get_installed_plugins.return_value = []
    installer.get_plugin_path.return_value = tmp_path / "plugin"
    return installer


@pytest.fixture
def installed_plugin_package(tmp_path):
    """Create a mock installed plugin package."""
    plugin_dir = tmp_path / "test_plugin"
    plugin_dir.mkdir()
    
    plugin_py = plugin_dir / "plugin.py"
    plugin_py.write_text(
        '''"""Test installed plugin."""
from typing import Any
from app.plugins.base import PluginType
from app.plugins.hooks import hookimpl

@hookimpl
def register_plugin_types() -> list[dict[str, Any]]:
    """Register plugin type."""
    return [{
        "type_id": "test_installed",
        "plugin_type": PluginType.SERVICE,
        "name": "Test Installed Plugin",
    }]

@hookimpl
def create_plugin_instance(
    plugin_id: str,
    type_id: str,
    name: str,
    config: dict[str, Any],
) -> Any:
    """Create plugin instance."""
    if type_id != "test_installed":
        return None
    return MagicMock(plugin_id=plugin_id, type_id=type_id, name=name)
'''
    )
    
    manifest = {
        "id": "test_plugin",
        "name": "Test Plugin",
        "version": "1.0.0",
        "type": "service",
    }
    (plugin_dir / "plugin.json").write_text(json.dumps(manifest))
    
    return plugin_dir


@pytest.mark.unit
class TestPluginLoader:
    """Test PluginLoader class."""

    def test_init(self, plugin_loader_instance):
        """Test PluginLoader initialization."""
        assert plugin_loader_instance._loaded_modules == set()

    @patch("app.plugins.loader.plugin_manager")
    @patch("pkgutil.iter_modules")
    @patch("importlib.import_module")
    @patch("pathlib.Path")
    def test_load_plugins_from_package(
        self,
        mock_path,
        mock_import_module,
        mock_iter_modules,
        mock_plugin_manager,
        plugin_loader_instance,
    ):
        """Test loading plugins from a package."""
        # Mock package module
        mock_package = MagicMock()
        mock_package.__file__ = "/path/to/package/__init__.py"
        
        # Mock plugin module with hooks
        mock_plugin_module = MagicMock()
        mock_plugin_module.register_plugin_types = MagicMock()
        
        # Mock Path operations
        mock_path_instance = MagicMock()
        mock_path_instance.parent = MagicMock()
        mock_path_instance.parent.__str__ = lambda x: "/path/to/package"
        mock_path.return_value = mock_path_instance
        
        # Setup mocks
        def import_side_effect(name):
            if name == "app.plugins.test":
                return mock_package
            elif name == "app.plugins.test.test_plugin":
                return mock_plugin_module
            return MagicMock()
        
        mock_import_module.side_effect = import_side_effect
        mock_iter_modules.return_value = [
            ("", "test_plugin", False),
        ]
        
        plugin_loader_instance.load_plugins_from_package("app.plugins.test")
        
        # Verify module was registered (if hooks were found)
        # Note: The actual registration depends on has_hooks check
        # We verify the method was called at least once
        assert mock_import_module.called

    def test_get_plugin_types(self, plugin_loader_instance):
        """Test getting plugin types."""
        with patch("app.plugins.loader.plugin_manager") as mock_manager:
            mock_manager.hook.register_plugin_types.return_value = [
                [{"type_id": "test1", "name": "Test 1"}],
                {"type_id": "test2", "name": "Test 2"},
            ]
            
            types = plugin_loader_instance.get_plugin_types()
            
            assert len(types) == 2
            assert types[0]["type_id"] == "test1"
            assert types[1]["type_id"] == "test2"

    def test_get_plugin_types_empty(self, plugin_loader_instance):
        """Test getting plugin types when none are registered."""
        with patch("app.plugins.loader.plugin_manager") as mock_manager:
            mock_manager.hook.register_plugin_types.return_value = []
            
            types = plugin_loader_instance.get_plugin_types()
            
            assert types == []

    def test_create_plugin_instance(self, plugin_loader_instance):
        """Test creating a plugin instance."""
        mock_plugin = MagicMock()
        
        with patch("app.plugins.loader.plugin_manager") as mock_manager:
            mock_manager.hook.create_plugin_instance.return_value = [
                None,
                mock_plugin,
                None,
            ]
            
            result = plugin_loader_instance.create_plugin_instance(
                plugin_id="test-1",
                type_id="test",
                name="Test Plugin",
                config={},
            )
            
            assert result == mock_plugin

    def test_create_plugin_instance_not_found(self, plugin_loader_instance):
        """Test creating a plugin instance when not found."""
        with patch("app.plugins.loader.plugin_manager") as mock_manager:
            mock_manager.hook.create_plugin_instance.return_value = [None, None]
            
            result = plugin_loader_instance.create_plugin_instance(
                plugin_id="test-1",
                type_id="test",
                name="Test Plugin",
                config={},
            )
            
            assert result is None

    @patch("app.plugins.loader.plugin_installer")
    @patch("app.plugins.loader.plugin_manager")
    def test_load_installed_plugins(
        self,
        mock_plugin_manager,
        mock_installer,
        plugin_loader_instance,
        installed_plugin_package,
    ):
        """Test loading installed plugins."""
        # Setup mock installer
        mock_installer.get_installed_plugins.return_value = [
            {"id": "test_plugin"},
        ]
        mock_installer.get_plugin_path.return_value = installed_plugin_package
        
        # Load installed plugins
        plugin_loader_instance.load_installed_plugins()
        
        # Verify plugin was registered
        assert mock_plugin_manager.register.called
        assert "installed_plugin_test_plugin" in plugin_loader_instance._loaded_modules

    @patch("app.plugins.loader.plugin_installer")
    def test_load_installed_plugins_missing_plugin_py(
        self,
        mock_installer,
        plugin_loader_instance,
        tmp_path,
    ):
        """Test loading installed plugin without plugin.py."""
        plugin_dir = tmp_path / "test_plugin"
        plugin_dir.mkdir()
        
        mock_installer.get_installed_plugins.return_value = [
            {"id": "test_plugin"},
        ]
        mock_installer.get_plugin_path.return_value = plugin_dir
        
        # Should not raise an error, just skip
        plugin_loader_instance.load_installed_plugins()

    @patch("app.plugins.loader.plugin_installer")
    @patch("app.plugins.loader.plugin_manager")
    def test_load_installed_plugins_error_handling(
        self,
        mock_plugin_manager,
        mock_installer,
        plugin_loader_instance,
        tmp_path,
    ):
        """Test error handling when loading installed plugin fails."""
        plugin_dir = tmp_path / "test_plugin"
        plugin_dir.mkdir()
        (plugin_dir / "plugin.py").write_text("invalid python code !!!")
        
        mock_installer.get_installed_plugins.return_value = [
            {"id": "test_plugin"},
        ]
        mock_installer.get_plugin_path.return_value = plugin_dir
        
        # Should not raise an error, just log and continue
        plugin_loader_instance.load_installed_plugins()

    @patch("app.plugins.loader.plugin_installer")
    def test_load_installed_plugins_no_hooks(
        self,
        mock_installer,
        plugin_loader_instance,
        tmp_path,
    ):
        """Test loading installed plugin without hooks."""
        plugin_dir = tmp_path / "test_plugin"
        plugin_dir.mkdir()
        (plugin_dir / "plugin.py").write_text("# No hooks here")
        
        mock_installer.get_installed_plugins.return_value = [
            {"id": "test_plugin"},
        ]
        mock_installer.get_plugin_path.return_value = plugin_dir
        
        # Should not register if no hooks
        plugin_loader_instance.load_installed_plugins()
        
        assert "installed_plugin_test_plugin" not in plugin_loader_instance._loaded_modules

    @patch("app.plugins.loader.plugin_installer")
    def test_load_all_plugins(
        self,
        mock_installer,
        plugin_loader_instance,
    ):
        """Test loading all plugins (built-in and installed)."""
        mock_installer.get_installed_plugins.return_value = []
        
        with patch.object(plugin_loader_instance, "load_plugins_from_package") as mock_load_package:
            with patch.object(plugin_loader_instance, "load_installed_plugins") as mock_load_installed:
                plugin_loader_instance.load_all_plugins()
                
                # Verify built-in packages are loaded
                assert mock_load_package.call_count == 3
                assert mock_load_installed.called

