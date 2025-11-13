"""Tests for plugin installer service."""

import json
import shutil
import tempfile
import zipfile
from pathlib import Path

import pytest

from app.services.plugin_installer import PluginInstaller


@pytest.fixture
def temp_plugins_dir(tmp_path):
    """Create a temporary plugins directory."""
    plugins_dir = tmp_path / "plugins"
    plugins_dir.mkdir()
    return plugins_dir


@pytest.fixture
def temp_frontend_dir(tmp_path):
    """Create a temporary frontend directory."""
    frontend_dir = tmp_path / "frontend" / "src" / "components" / "plugins"
    frontend_dir.mkdir(parents=True)
    return frontend_dir


@pytest.fixture
def plugin_installer(temp_plugins_dir, temp_frontend_dir, monkeypatch):
    """Create a PluginInstaller instance with temporary directories."""
    installer = PluginInstaller()
    # Override directories with temp paths
    installer.plugins_dir = temp_plugins_dir
    installer.frontend_plugins_dir = temp_frontend_dir
    return installer


@pytest.fixture
def valid_plugin_manifest():
    """Return a valid plugin manifest."""
    return {
        "id": "test_plugin",
        "name": "Test Plugin",
        "description": "A test plugin",
        "version": "1.0.0",
        "type": "service",
        "author": "Test Author",
        "license": "MIT",
    }


@pytest.fixture
def valid_plugin_package(tmp_path, valid_plugin_manifest):
    """Create a valid plugin package directory."""
    plugin_dir = tmp_path / "test_plugin"
    plugin_dir.mkdir()
    
    # Create plugin.json
    manifest_path = plugin_dir / "plugin.json"
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(valid_plugin_manifest, f, indent=2)
    
    # Create plugin.py
    plugin_py = plugin_dir / "plugin.py"
    plugin_py.write_text(
        '''"""Test plugin."""
from typing import Any
from app.plugins.base import PluginType
from app.plugins.hooks import hookimpl

@hookimpl
def register_plugin_types() -> list[dict[str, Any]]:
    """Register plugin type."""
    return [{"type_id": "test_plugin", "plugin_type": PluginType.SERVICE}]
'''
    )
    
    return plugin_dir


@pytest.fixture
def plugin_package_with_frontend(tmp_path, valid_plugin_package):
    """Create a plugin package with frontend components."""
    frontend_dir = valid_plugin_package / "frontend"
    frontend_dir.mkdir()
    
    component_file = frontend_dir / "TestComponent.vue"
    component_file.write_text('<template><div>Test Component</div></template>')
    
    return valid_plugin_package


@pytest.fixture
def plugin_zip_file(tmp_path, valid_plugin_package):
    """Create a zip file containing a valid plugin package."""
    zip_path = tmp_path / "test_plugin.zip"
    with zipfile.ZipFile(zip_path, "w") as zipf:
        for file_path in valid_plugin_package.rglob("*"):
            if file_path.is_file():
                arcname = file_path.relative_to(valid_plugin_package)
                zipf.write(file_path, arcname)
    return zip_path


@pytest.mark.unit
class TestPluginInstaller:
    """Test PluginInstaller class."""

    def test_get_plugin_path(self, plugin_installer):
        """Test getting plugin path."""
        path = plugin_installer.get_plugin_path("test_plugin")
        assert path == plugin_installer.plugins_dir / "test_plugin"

    def test_get_frontend_plugin_path(self, plugin_installer):
        """Test getting frontend plugin path."""
        path = plugin_installer.get_frontend_plugin_path("test_plugin")
        assert path == plugin_installer.frontend_plugins_dir / "test_plugin"

    def test_validate_plugin_directory_valid(self, plugin_installer, valid_plugin_package):
        """Test validating a valid plugin directory."""
        manifest = plugin_installer.validate_plugin_package(valid_plugin_package)
        assert manifest["id"] == "test_plugin"
        assert manifest["name"] == "Test Plugin"

    def test_validate_plugin_directory_missing_manifest(self, plugin_installer, tmp_path):
        """Test validating plugin directory without plugin.json."""
        plugin_dir = tmp_path / "invalid_plugin"
        plugin_dir.mkdir()
        (plugin_dir / "plugin.py").write_text("# Plugin code")
        
        with pytest.raises(ValueError, match="plugin.json not found"):
            plugin_installer.validate_plugin_package(plugin_dir)

    def test_validate_plugin_directory_missing_plugin_py(self, plugin_installer, tmp_path, valid_plugin_manifest):
        """Test validating plugin directory without plugin.py."""
        plugin_dir = tmp_path / "invalid_plugin"
        plugin_dir.mkdir()
        (plugin_dir / "plugin.json").write_text(json.dumps(valid_plugin_manifest))
        
        with pytest.raises(ValueError, match="plugin.py not found"):
            plugin_installer.validate_plugin_package(plugin_dir)

    def test_validate_plugin_directory_invalid_json(self, plugin_installer, tmp_path):
        """Test validating plugin directory with invalid JSON."""
        plugin_dir = tmp_path / "invalid_plugin"
        plugin_dir.mkdir()
        (plugin_dir / "plugin.json").write_text("{ invalid json }")
        (plugin_dir / "plugin.py").write_text("# Plugin code")
        
        with pytest.raises(ValueError, match="Invalid JSON"):
            plugin_installer.validate_plugin_package(plugin_dir)

    def test_validate_plugin_directory_missing_required_fields(self, plugin_installer, tmp_path):
        """Test validating plugin directory with missing required fields."""
        plugin_dir = tmp_path / "invalid_plugin"
        plugin_dir.mkdir()
        (plugin_dir / "plugin.json").write_text('{"name": "Test"}')  # Missing id, version, type
        (plugin_dir / "plugin.py").write_text("# Plugin code")
        
        with pytest.raises(ValueError, match="Missing required field"):
            plugin_installer.validate_plugin_package(plugin_dir)

    def test_validate_plugin_directory_invalid_type(self, plugin_installer, tmp_path):
        """Test validating plugin directory with invalid type."""
        plugin_dir = tmp_path / "invalid_plugin"
        plugin_dir.mkdir()
        manifest = {"id": "test", "name": "Test", "version": "1.0.0", "type": "invalid"}
        (plugin_dir / "plugin.json").write_text(json.dumps(manifest))
        (plugin_dir / "plugin.py").write_text("# Plugin code")
        
        with pytest.raises(ValueError, match="Invalid plugin type"):
            plugin_installer.validate_plugin_package(plugin_dir)

    def test_validate_plugin_zip_file(self, plugin_installer, plugin_zip_file):
        """Test validating a plugin zip file."""
        manifest = plugin_installer.validate_plugin_package(plugin_zip_file)
        assert manifest["id"] == "test_plugin"

    def test_install_plugin_from_directory(self, plugin_installer, valid_plugin_package):
        """Test installing a plugin from a directory."""
        manifest = plugin_installer.install_plugin(valid_plugin_package)
        
        assert manifest["id"] == "test_plugin"
        
        # Check plugin was installed
        plugin_path = plugin_installer.get_plugin_path("test_plugin")
        assert plugin_path.exists()
        assert (plugin_path / "plugin.json").exists()
        assert (plugin_path / "plugin.py").exists()

    def test_install_plugin_from_zip(self, plugin_installer, plugin_zip_file):
        """Test installing a plugin from a zip file."""
        manifest = plugin_installer.install_plugin(plugin_zip_file)
        
        assert manifest["id"] == "test_plugin"
        
        # Check plugin was installed
        plugin_path = plugin_installer.get_plugin_path("test_plugin")
        assert plugin_path.exists()
        assert (plugin_path / "plugin.json").exists()
        assert (plugin_path / "plugin.py").exists()

    def test_install_plugin_with_custom_id(self, plugin_installer, valid_plugin_package):
        """Test installing a plugin with a custom ID override."""
        manifest = plugin_installer.install_plugin(valid_plugin_package, plugin_id="custom_id")
        
        assert manifest["id"] == "test_plugin"  # Manifest ID is unchanged
        # But plugin is installed with custom ID
        plugin_path = plugin_installer.get_plugin_path("custom_id")
        assert plugin_path.exists()

    def test_install_plugin_already_installed(self, plugin_installer, valid_plugin_package):
        """Test installing a plugin that's already installed."""
        plugin_installer.install_plugin(valid_plugin_package)
        
        with pytest.raises(ValueError, match="already installed"):
            plugin_installer.install_plugin(valid_plugin_package)

    def test_install_plugin_with_frontend_components(self, plugin_installer, plugin_package_with_frontend):
        """Test installing a plugin with frontend components."""
        manifest = plugin_installer.install_plugin(plugin_package_with_frontend)
        
        # Check frontend components were installed
        frontend_path = plugin_installer.get_frontend_plugin_path("test_plugin")
        assert frontend_path.exists()
        assert (frontend_path / "TestComponent.vue").exists()

    def test_install_plugin_cleanup_on_error(self, plugin_installer, tmp_path):
        """Test that plugin installation is cleaned up on error."""
        # Create an invalid plugin package (missing plugin.py)
        invalid_plugin = tmp_path / "invalid"
        invalid_plugin.mkdir()
        manifest = {"id": "invalid", "name": "Invalid", "version": "1.0.0", "type": "service"}
        (invalid_plugin / "plugin.json").write_text(json.dumps(manifest))
        # No plugin.py - will fail validation
        
        with pytest.raises(ValueError):
            plugin_installer.install_plugin(invalid_plugin)
        
        # Check plugin directory was cleaned up
        plugin_path = plugin_installer.get_plugin_path("invalid")
        assert not plugin_path.exists()

    def test_uninstall_plugin(self, plugin_installer, valid_plugin_package):
        """Test uninstalling a plugin."""
        plugin_installer.install_plugin(valid_plugin_package)
        
        plugin_path = plugin_installer.get_plugin_path("test_plugin")
        assert plugin_path.exists()
        
        plugin_installer.uninstall_plugin("test_plugin")
        
        assert not plugin_path.exists()

    def test_uninstall_plugin_with_frontend(self, plugin_installer, plugin_package_with_frontend):
        """Test uninstalling a plugin with frontend components."""
        plugin_installer.install_plugin(plugin_package_with_frontend)
        
        frontend_path = plugin_installer.get_frontend_plugin_path("test_plugin")
        assert frontend_path.exists()
        
        plugin_installer.uninstall_plugin("test_plugin")
        
        assert not frontend_path.exists()

    def test_uninstall_plugin_not_installed(self, plugin_installer):
        """Test uninstalling a plugin that's not installed."""
        with pytest.raises(ValueError, match="not installed"):
            plugin_installer.uninstall_plugin("nonexistent")

    def test_get_installed_plugins_empty(self, plugin_installer):
        """Test getting installed plugins when none are installed."""
        plugins = plugin_installer.get_installed_plugins()
        assert plugins == []

    def test_get_installed_plugins(self, plugin_installer, valid_plugin_package):
        """Test getting list of installed plugins."""
        plugin_installer.install_plugin(valid_plugin_package)
        
        plugins = plugin_installer.get_installed_plugins()
        assert len(plugins) == 1
        assert plugins[0]["id"] == "test_plugin"
        assert "_installed_path" in plugins[0]

    def test_get_installed_plugins_multiple(self, plugin_installer, tmp_path, valid_plugin_manifest):
        """Test getting multiple installed plugins."""
        # Install first plugin
        plugin1_dir = tmp_path / "plugin1"
        plugin1_dir.mkdir()
        manifest1 = {**valid_plugin_manifest, "id": "plugin1"}
        (plugin1_dir / "plugin.json").write_text(json.dumps(manifest1))
        (plugin1_dir / "plugin.py").write_text("# Plugin 1")
        plugin_installer.install_plugin(plugin1_dir)
        
        # Install second plugin
        plugin2_dir = tmp_path / "plugin2"
        plugin2_dir.mkdir()
        manifest2 = {**valid_plugin_manifest, "id": "plugin2"}
        (plugin2_dir / "plugin.json").write_text(json.dumps(manifest2))
        (plugin2_dir / "plugin.py").write_text("# Plugin 2")
        plugin_installer.install_plugin(plugin2_dir)
        
        plugins = plugin_installer.get_installed_plugins()
        assert len(plugins) == 2
        plugin_ids = {p["id"] for p in plugins}
        assert plugin_ids == {"plugin1", "plugin2"}

    def test_get_plugin_manifest(self, plugin_installer, valid_plugin_package):
        """Test getting plugin manifest."""
        plugin_installer.install_plugin(valid_plugin_package)
        
        manifest = plugin_installer.get_plugin_manifest("test_plugin")
        assert manifest is not None
        assert manifest["id"] == "test_plugin"
        assert manifest["name"] == "Test Plugin"

    def test_get_plugin_manifest_not_installed(self, plugin_installer):
        """Test getting manifest for non-installed plugin."""
        manifest = plugin_installer.get_plugin_manifest("nonexistent")
        assert manifest is None

    def test_get_plugin_manifest_invalid_json(self, plugin_installer, valid_plugin_package):
        """Test getting manifest with invalid JSON."""
        plugin_installer.install_plugin(valid_plugin_package)
        
        # Corrupt the manifest file
        manifest_path = plugin_installer.get_plugin_path("test_plugin") / "plugin.json"
        manifest_path.write_text("{ invalid json }")
        
        manifest = plugin_installer.get_plugin_manifest("test_plugin")
        assert manifest is None

    def test_zip_file_with_subdirectory(self, plugin_installer, tmp_path, valid_plugin_manifest):
        """Test installing zip file that contains a root directory."""
        # Create a zip with files in a subdirectory
        zip_path = tmp_path / "plugin.zip"
        plugin_dir = tmp_path / "plugin_root" / "test_plugin"
        plugin_dir.mkdir(parents=True)
        
        (plugin_dir / "plugin.json").write_text(json.dumps(valid_plugin_manifest))
        (plugin_dir / "plugin.py").write_text("# Plugin code")
        
        with zipfile.ZipFile(zip_path, "w") as zipf:
            for file_path in plugin_dir.rglob("*"):
                if file_path.is_file():
                    # Include the subdirectory in the zip
                    arcname = file_path.relative_to(plugin_dir.parent)
                    zipf.write(file_path, arcname)
        
        # Install should handle the subdirectory
        manifest = plugin_installer.install_plugin(zip_path)
        assert manifest["id"] == "test_plugin"
        
        plugin_path = plugin_installer.get_plugin_path("test_plugin")
        assert (plugin_path / "plugin.json").exists()

    def test_install_plugin_excludes_cache_files(self, plugin_installer, valid_plugin_package):
        """Test that cache files are excluded during installation."""
        # Add cache files to plugin package
        (valid_plugin_package / "__pycache__").mkdir()
        (valid_plugin_package / "__pycache__" / "plugin.cpython-311.pyc").write_bytes(b"fake bytecode")
        (valid_plugin_package / ".git").mkdir()
        (valid_plugin_package / ".gitignore").write_text("*.pyc")
        
        plugin_installer.install_plugin(valid_plugin_package)
        
        plugin_path = plugin_installer.get_plugin_path("test_plugin")
        # __pycache__ should not be copied
        assert not (plugin_path / "__pycache__").exists()
        # .git should not be copied
        assert not (plugin_path / ".git").exists()
        # .gitignore should not be copied
        assert not (plugin_path / ".gitignore").exists()

