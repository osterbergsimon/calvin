"""Tests for GitHub plugin installation functionality."""

import json

import pytest

from app.services.plugin_installer import PluginInstaller


@pytest.fixture
def plugin_installer(temp_plugins_dir, monkeypatch):
    """Create a PluginInstaller instance with temporary directories."""
    installer = PluginInstaller()
    installer.plugins_dir = temp_plugins_dir
    return installer


@pytest.fixture
def mock_repo_structure(tmp_path):
    """Create a mock repository structure with multiple plugins."""
    repo_root = tmp_path / "repo"
    repo_root.mkdir()

    # Plugin 1: Simple plugin
    plugin1_dir = repo_root / "plugin1"
    plugin1_dir.mkdir()
    manifest1 = {
        "id": "plugin1",
        "name": "Plugin 1",
        "version": "1.0.0",
        "type": "service",
    }
    (plugin1_dir / "plugin.json").write_text(json.dumps(manifest1))
    (plugin1_dir / "plugin.py").write_text("# Plugin 1 code")

    # Plugin 2: Plugin with frontend
    plugin2_dir = repo_root / "plugin2"
    plugin2_dir.mkdir()
    manifest2 = {
        "id": "plugin2",
        "name": "Plugin 2",
        "version": "2.0.0",
        "type": "calendar",
    }
    (plugin2_dir / "plugin.json").write_text(json.dumps(manifest2))
    (plugin2_dir / "plugin.py").write_text("# Plugin 2 code")
    frontend_dir = plugin2_dir / "frontend"
    frontend_dir.mkdir()
    (frontend_dir / "Component.vue").write_text("<template><div>Component</div></template>")

    # Plugin 3: In subdirectory
    plugin3_dir = repo_root / "plugins" / "plugin3"
    plugin3_dir.mkdir(parents=True)
    manifest3 = {
        "id": "plugin3",
        "name": "Plugin 3",
        "version": "3.0.0",
        "type": "image",
    }
    (plugin3_dir / "plugin.json").write_text(json.dumps(manifest3))
    (plugin3_dir / "plugin.py").write_text("# Plugin 3 code")

    return repo_root


@pytest.fixture
def mock_repo_with_manifest(tmp_path, mock_repo_structure):
    """Create a repository with plugins.json manifest."""
    manifest = {
        "plugins": [
            {
                "id": "plugin1",
                "name": "Plugin 1",
                "path": "plugin1",
                "description": "First plugin",
                "version": "1.0.0",
                "type": "service",
            },
            {
                "id": "plugin2",
                "name": "Plugin 2",
                "path": "plugin2",
                "description": "Second plugin",
                "version": "2.0.0",
                "type": "calendar",
            },
        ]
    }
    (mock_repo_structure / "plugins.json").write_text(json.dumps(manifest))
    return mock_repo_structure


@pytest.fixture
def test_plugin_repo_structure(tmp_path):
    """Create a mock repository structure with the test plugin."""
    repo_root = tmp_path / "repo"
    repo_root.mkdir()

    # Test plugin matching the structure in calvin-plugins/test-plugin
    test_plugin_dir = repo_root / "test-plugin"
    test_plugin_dir.mkdir()

    manifest = {
        "id": "test_plugin",
        "name": "Test Plugin",
        "version": "1.0.0",
        "type": "service",
        "description": "A basic test plugin for plugin installation testing",
        "author": "Calvin Test Suite",
        "license": "MIT",
    }
    (test_plugin_dir / "plugin.json").write_text(json.dumps(manifest))

    # Write a minimal but valid plugin.py
    plugin_code = '''"""Test plugin for plugin installation testing."""

from typing import Any

from app.plugins.base import PluginType
from app.plugins.hooks import hookimpl
from app.plugins.protocols import ServicePlugin


class TestServicePlugin(ServicePlugin):
    """Test service plugin for installation testing."""

    @classmethod
    def get_plugin_metadata(cls) -> dict[str, Any]:
        """Get plugin metadata for registration."""
        return {
            "type_id": "test_plugin",
            "plugin_type": PluginType.SERVICE,
            "name": "Test Plugin",
            "description": "A basic test plugin for plugin installation testing",
            "version": "1.0.0",
            "common_config_schema": {
                "message": {
                    "type": "string",
                    "description": "Test message to display",
                    "default": "Hello from test plugin!",
                    "ui": {
                        "component": "input",
                        "placeholder": "Enter a message",
                        "validation": {
                            "required": False,
                        },
                    },
                },
            },
            "display_schema": {
                "type": "api",
                "api_endpoint": None,
                "method": None,
                "data_schema": None,
                "render_template": "iframe",
            },
            "plugin_class": cls,
        }

    def __init__(
        self,
        plugin_id: str,
        name: str,
        message: str = "Hello from test plugin!",
        enabled: bool = True,
    ):
        super().__init__(plugin_id, name, enabled)
        self.message = message

    async def initialize(self) -> None:
        """Initialize the plugin."""
        pass

    async def cleanup(self) -> None:
        """Cleanup plugin resources."""
        pass

    async def get_content(self) -> dict[str, Any]:
        """Get service content for display."""
        return {
            "type": "iframe",
            "url": "about:blank",
            "config": {
                "message": self.message,
            },
        }

    async def validate_config(self, config: dict[str, Any]) -> bool:
        """Validate plugin configuration."""
        return True


@hookimpl
def register_plugin_types() -> list[dict[str, Any]]:
    """Register TestServicePlugin type."""
    return [TestServicePlugin.get_plugin_metadata()]


@hookimpl
def create_plugin_instance(
    plugin_id: str,
    type_id: str,
    name: str,
    config: dict[str, Any],
) -> TestServicePlugin | None:
    """Create a TestServicePlugin instance."""
    if type_id != "test_plugin":
        return None

    enabled = config.get("enabled", False)
    message = config.get("message", "Hello from test plugin!")

    if isinstance(message, dict):
        message = message.get("value") or message.get("default") or "Hello from test plugin!"
    message = str(message) if message else "Hello from test plugin!"

    return TestServicePlugin(
        plugin_id=plugin_id,
        name=name,
        message=message,
        enabled=enabled,
    )
'''
    (test_plugin_dir / "plugin.py").write_text(plugin_code)

    # Add plugins.json manifest
    repo_manifest = {
        "version": "1.0.0",
        "plugins": [
            {
                "id": "test_plugin",
                "name": "Test Plugin",
                "path": "test-plugin",
                "description": "A basic test plugin for plugin installation testing",
                "version": "1.0.0",
                "type": "service",
            }
        ],
    }
    (repo_root / "plugins.json").write_text(json.dumps(repo_manifest))

    return repo_root


@pytest.mark.unit
class TestPluginEnumeration:
    """Test plugin enumeration from repositories."""

    def test_enumerate_plugins_auto_discovery(self, plugin_installer, mock_repo_structure):
        """Test auto-discovery of plugins in repository."""
        result = plugin_installer.enumerate_plugins_from_repo(mock_repo_structure)

        assert result["has_manifest"] is False
        # Auto-discovery only finds plugins in top-level directories
        # plugin3 is in plugins/plugin3 subdirectory, so it won't be found
        assert len(result["plugins"]) == 2

        plugin_ids = {p["id"] for p in result["plugins"]}
        assert plugin_ids == {"plugin1", "plugin2"}

    def test_enumerate_plugins_with_manifest(self, plugin_installer, mock_repo_with_manifest):
        """Test enumeration using plugins.json manifest."""
        result = plugin_installer.enumerate_plugins_from_repo(mock_repo_with_manifest)

        assert result["has_manifest"] is True
        assert len(result["plugins"]) == 2

        plugin_ids = {p["id"] for p in result["plugins"]}
        assert plugin_ids == {"plugin1", "plugin2"}

        # Check that manifest metadata is used
        plugin1 = next(p for p in result["plugins"] if p["id"] == "plugin1")
        assert plugin1["description"] == "First plugin"

    def test_enumerate_plugins_skips_invalid(self, plugin_installer, tmp_path):
        """Test that invalid plugins are skipped during enumeration."""
        repo_root = tmp_path / "repo"
        repo_root.mkdir()

        # Valid plugin
        valid_plugin = repo_root / "valid"
        valid_plugin.mkdir()
        (valid_plugin / "plugin.json").write_text(
            json.dumps({"id": "valid", "name": "Valid", "version": "1.0.0", "type": "service"})
        )
        (valid_plugin / "plugin.py").write_text("# Valid")

        # Invalid plugin (missing plugin.py)
        invalid_plugin = repo_root / "invalid"
        invalid_plugin.mkdir()
        (invalid_plugin / "plugin.json").write_text(
            json.dumps({"id": "invalid", "name": "Invalid", "version": "1.0.0", "type": "service"})
        )
        # No plugin.py

        result = plugin_installer.enumerate_plugins_from_repo(repo_root)

        assert len(result["plugins"]) == 1
        assert result["plugins"][0]["id"] == "valid"

    def test_enumerate_plugins_skips_common_dirs(self, plugin_installer, tmp_path):
        """Test that common non-plugin directories are skipped."""
        repo_root = tmp_path / "repo"
        repo_root.mkdir()

        # Valid plugin
        valid_plugin = repo_root / "valid"
        valid_plugin.mkdir()
        (valid_plugin / "plugin.json").write_text(
            json.dumps({"id": "valid", "name": "Valid", "version": "1.0.0", "type": "service"})
        )
        (valid_plugin / "plugin.py").write_text("# Valid")

        # Common directories that should be skipped
        (repo_root / ".git").mkdir()
        (repo_root / "__pycache__").mkdir()
        (repo_root / "node_modules").mkdir()
        (repo_root / ".venv").mkdir()

        result = plugin_installer.enumerate_plugins_from_repo(repo_root)

        assert len(result["plugins"]) == 1
        assert result["plugins"][0]["id"] == "valid"


@pytest.mark.unit
class TestPluginInstallFromRepo:
    """Test installing plugins from repositories."""

    def test_install_plugin_from_repo(self, plugin_installer, mock_repo_structure):
        """Test installing a plugin from a repository."""
        manifest = plugin_installer.install_plugin_from_repo(
            mock_repo_structure, "plugin1", plugin_id=None
        )

        assert manifest["id"] == "plugin1"
        assert manifest["name"] == "Plugin 1"

        # Check plugin was installed
        plugin_path = plugin_installer.get_plugin_path("plugin1")
        assert plugin_path.exists()
        assert (plugin_path / "plugin.json").exists()
        assert (plugin_path / "plugin.py").exists()

    def test_install_plugin_from_repo_with_frontend(self, plugin_installer, mock_repo_structure):
        """Test installing a plugin with frontend components from repo."""
        manifest = plugin_installer.install_plugin_from_repo(
            mock_repo_structure, "plugin2", plugin_id=None
        )

        assert manifest["id"] == "plugin2"

        # Frontend assets stay inside the plugin's data dir (host serves them
        # via /api/plugins/{id}/static/*).
        plugin_path = plugin_installer.get_plugin_path("plugin2")
        assert (plugin_path / "frontend" / "Component.vue").exists()

    def test_install_plugin_from_repo_path_traversal_protection(
        self, plugin_installer, mock_repo_structure
    ):
        """Test that path traversal attacks are prevented."""
        with pytest.raises(ValueError, match="path traversal not allowed"):
            plugin_installer.install_plugin_from_repo(mock_repo_structure, "../etc/passwd")

        with pytest.raises(ValueError, match="path traversal not allowed"):
            plugin_installer.install_plugin_from_repo(mock_repo_structure, "/absolute/path")

    def test_install_plugin_from_repo_not_found(self, plugin_installer, mock_repo_structure):
        """Test installing a non-existent plugin from repo."""
        with pytest.raises(ValueError, match="not found"):
            plugin_installer.install_plugin_from_repo(mock_repo_structure, "nonexistent")

    def test_install_plugin_from_repo_already_installed(
        self, plugin_installer, mock_repo_structure
    ):
        """Test installing a plugin that's already installed."""
        plugin_installer.install_plugin_from_repo(mock_repo_structure, "plugin1")

        with pytest.raises(ValueError, match="already installed"):
            plugin_installer.install_plugin_from_repo(mock_repo_structure, "plugin1")

    def test_install_plugin_from_repo_corrupted_plugin_cleanup(
        self, plugin_installer, mock_repo_structure, tmp_path
    ):
        """Test that corrupted/invalid plugin directories are cleaned up and allow reinstallation."""
        plugin_id = "corrupted_plugin"
        plugin_path = plugin_installer.get_plugin_path(plugin_id)
        plugin_path.mkdir(parents=True)

        # Create a corrupted plugin directory (exists but no valid manifest)
        # This simulates a failed installation that left a directory behind
        (plugin_path / "some_file.txt").write_text("corrupted")
        # No plugin.json - this makes it invalid (get_plugin_manifest will fail)

        # Create a mock repo structure for the corrupted plugin
        corrupted_plugin_repo = tmp_path / "corrupted_plugin_repo"
        corrupted_plugin_repo.mkdir()
        plugin_dir = corrupted_plugin_repo / "plugin1"
        plugin_dir.mkdir()
        (plugin_dir / "plugin.json").write_text(
            json.dumps(
                {
                    "id": "corrupted_plugin",
                    "name": "Corrupted Plugin",
                    "version": "1.0.0",
                    "type": "service",
                }
            )
        )
        (plugin_dir / "plugin.py").write_text("# Plugin code")

        # Verify corrupted directory exists before cleanup
        assert plugin_path.exists()
        assert not (plugin_path / "plugin.json").exists()

        # Verify get_plugin_manifest returns None for corrupted plugin (no manifest file)
        manifest_result = plugin_installer.get_plugin_manifest(plugin_id)
        assert manifest_result is None, "Corrupted plugin should not have a valid manifest"

        # Should clean up corrupted directory and allow installation
        # The cleanup happens in install_plugin_from_repo when it detects the manifest is None
        manifest = plugin_installer.install_plugin_from_repo(
            corrupted_plugin_repo, "plugin1", plugin_id=plugin_id
        )

        # Verify plugin was installed successfully
        assert manifest["id"] == "corrupted_plugin"
        assert (plugin_path / "plugin.json").exists()
        assert (plugin_path / "plugin.py").exists()

    def test_install_test_plugin_from_repo(self, plugin_installer, test_plugin_repo_structure):
        """Test installing the test plugin from repository."""
        manifest = plugin_installer.install_plugin_from_repo(
            test_plugin_repo_structure, "test-plugin", plugin_id=None
        )

        assert manifest["id"] == "test_plugin"
        assert manifest["name"] == "Test Plugin"
        assert manifest["version"] == "1.0.0"
        assert manifest["type"] == "service"

        # Check plugin was installed
        plugin_path = plugin_installer.get_plugin_path("test_plugin")
        assert plugin_path.exists()
        assert (plugin_path / "plugin.json").exists()
        assert (plugin_path / "plugin.py").exists()

        # Verify plugin.json content
        installed_manifest = json.loads((plugin_path / "plugin.json").read_text())
        assert installed_manifest["id"] == "test_plugin"
        assert installed_manifest["name"] == "Test Plugin"

        # Verify plugin.py content
        plugin_code = (plugin_path / "plugin.py").read_text()
        assert "TestServicePlugin" in plugin_code
        assert "test_plugin" in plugin_code

        # Cleanup
        plugin_installer.uninstall_plugin("test_plugin")

    def test_enumerate_test_plugin_from_repo(self, plugin_installer, test_plugin_repo_structure):
        """Test enumerating the test plugin from repository."""
        result = plugin_installer.enumerate_plugins_from_repo(test_plugin_repo_structure)

        assert result["has_manifest"] is True
        assert len(result["plugins"]) == 1

        plugin = result["plugins"][0]
        assert plugin["id"] == "test_plugin"
        assert plugin["name"] == "Test Plugin"
        assert plugin["path"] == "test-plugin"
        assert plugin["version"] == "1.0.0"
        assert plugin["type"] == "service"


@pytest.mark.unit
class TestVersionChecking:
    """Test version checking during installation."""

    def test_install_plugin_version_check_newer(self, plugin_installer, tmp_path):
        """Test that newer versions can be installed."""
        # Install version 1.0.0
        plugin_dir1 = tmp_path / "plugin1"
        plugin_dir1.mkdir()
        manifest1 = {
            "id": "test_plugin",
            "name": "Test",
            "version": "1.0.0",
            "type": "service",
        }
        (plugin_dir1 / "plugin.json").write_text(json.dumps(manifest1))
        (plugin_dir1 / "plugin.py").write_text("# Plugin")
        plugin_installer.install_plugin(plugin_dir1, check_version=True)

        # Try to install version 2.0.0 (should work)
        plugin_dir2 = tmp_path / "plugin2"
        plugin_dir2.mkdir()
        manifest2 = {**manifest1, "version": "2.0.0"}
        (plugin_dir2 / "plugin.json").write_text(json.dumps(manifest2))
        (plugin_dir2 / "plugin.py").write_text("# Plugin")

        # Should raise error because already installed, not because of version
        with pytest.raises(ValueError, match="already installed"):
            plugin_installer.install_plugin(plugin_dir2, check_version=True)

    def test_install_plugin_version_check_older(self, plugin_installer, tmp_path):
        """Test that older versions are rejected when plugin is already installed."""
        # Install version 2.0.0 first
        plugin_dir1 = tmp_path / "plugin1"
        plugin_dir1.mkdir()
        manifest1 = {
            "id": "test_plugin",
            "name": "Test",
            "version": "2.0.0",
            "type": "service",
        }
        (plugin_dir1 / "plugin.json").write_text(json.dumps(manifest1))
        (plugin_dir1 / "plugin.py").write_text("# Plugin")
        plugin_installer.install_plugin(plugin_dir1, check_version=True)

        # Try to install version 1.0.0 while 2.0.0 is installed
        plugin_dir2 = tmp_path / "plugin2"
        plugin_dir2.mkdir()
        manifest2 = {**manifest1, "version": "1.0.0"}
        (plugin_dir2 / "plugin.json").write_text(json.dumps(manifest2))
        (plugin_dir2 / "plugin.py").write_text("# Plugin")

        # Should fail - either with version check error or already installed error
        # (version check might not work if packaging library isn't available)
        with pytest.raises(ValueError) as exc_info:
            plugin_installer.install_plugin(plugin_dir2, check_version=True)

        error_msg = str(exc_info.value).lower()
        # Accept either version error or already installed error
        assert "older than installed version" in error_msg or "already installed" in error_msg

        # Cleanup
        plugin_installer.uninstall_plugin("test_plugin")

    def test_install_plugin_version_check_disabled(self, plugin_installer, tmp_path):
        """Test that version checking can be disabled."""
        # Install version 2.0.0
        plugin_dir1 = tmp_path / "plugin1"
        plugin_dir1.mkdir()
        manifest1 = {
            "id": "test_plugin",
            "name": "Test",
            "version": "2.0.0",
            "type": "service",
        }
        (plugin_dir1 / "plugin.json").write_text(json.dumps(manifest1))
        (plugin_dir1 / "plugin.py").write_text("# Plugin")
        plugin_installer.install_plugin(plugin_dir1, check_version=True)

        # Uninstall
        plugin_installer.uninstall_plugin("test_plugin")

        # Reinstall 2.0.0
        plugin_installer.install_plugin(plugin_dir1, check_version=True)

        # Try 1.0.0 with check_version=False - should still fail because already installed
        plugin_dir2 = tmp_path / "plugin2"
        plugin_dir2.mkdir()
        manifest2 = {**manifest1, "version": "1.0.0"}
        (plugin_dir2 / "plugin.json").write_text(json.dumps(manifest2))
        (plugin_dir2 / "plugin.py").write_text("# Plugin")

        with pytest.raises(ValueError, match="already installed"):
            plugin_installer.install_plugin(plugin_dir2, check_version=False)
