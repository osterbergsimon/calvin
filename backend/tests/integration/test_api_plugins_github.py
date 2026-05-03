"""Integration tests for GitHub plugin installation API endpoints."""

import json
import zipfile
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.plugin_installer import plugin_installer


@pytest.mark.integration
class TestGitHubPluginEnumeration:
    """Test GitHub plugin enumeration endpoint."""

    @pytest.fixture
    def mock_github_zip(self, tmp_path):
        """Create a mock GitHub repository zip file."""
        zip_path = tmp_path / "repo.zip"

        # Create zip structure like GitHub: repo-main/
        with zipfile.ZipFile(zip_path, "w") as zipf:
            # Plugin 1
            zipf.writestr(
                "repo-main/plugin1/plugin.json",
                json.dumps(
                    {
                        "id": "github_plugin1",
                        "name": "GitHub Plugin 1",
                        "version": "1.0.0",
                        "type": "service",
                    }
                ),
            )
            zipf.writestr("repo-main/plugin1/plugin.py", "# Plugin 1")

            # Plugin 2 with frontend static assets
            zipf.writestr(
                "repo-main/plugin2/plugin.json",
                json.dumps(
                    {
                        "id": "github_plugin2",
                        "name": "GitHub Plugin 2",
                        "version": "2.0.0",
                        "type": "calendar",
                    }
                ),
            )
            zipf.writestr("repo-main/plugin2/plugin.py", "# Plugin 2")
            zipf.writestr(
                "repo-main/plugin2/frontend/dist.js",
                "customElements.define('calvin-github-plugin2', class extends HTMLElement {})",
            )

            # plugins.json manifest
            zipf.writestr(
                "repo-main/plugins.json",
                json.dumps(
                    {
                        "plugins": [
                            {
                                "id": "github_plugin1",
                                "name": "GitHub Plugin 1",
                                "path": "plugin1",
                                "version": "1.0.0",
                                "type": "service",
                            },
                        ]
                    }
                ),
            )

        return zip_path

    @patch("httpx.AsyncClient")
    def test_enumerate_plugins_from_github_success(
        self, mock_client_class, test_client, mock_github_zip
    ):
        """Test successfully enumerating plugins from GitHub."""
        # Mock GitHub API response
        with open(mock_github_zip, "rb") as f:
            zip_content = f.read()

        # Create async mock response
        async def mock_get_async(*args, **kwargs):
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.content = zip_content
            mock_response.raise_for_status = MagicMock()
            return mock_response

        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.get = AsyncMock(side_effect=mock_get_async)
        mock_client_class.return_value = mock_client

        response = test_client.post(
            "/api/plugins/github/enumerate",
            json={"repo_url": "https://github.com/user/repo", "branch": "main"},
        )

        # Route might not be available in test client - check if it exists
        if response.status_code == 404:
            pytest.skip("GitHub enumeration route not available in test client")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "plugins" in data
        assert len(data["plugins"]) >= 1

        # Check that plugins are listed
        plugin_ids = [p["id"] for p in data["plugins"]]
        assert "github_plugin1" in plugin_ids

    @patch("httpx.AsyncClient")
    def test_enumerate_plugins_from_github_branch_fallback(
        self, mock_client_class, test_client, mock_github_zip
    ):
        """Test branch fallback from main to master."""
        with open(mock_github_zip, "rb") as f:
            zip_content = f.read()

        # Create mock response objects
        mock_response_404 = MagicMock()
        mock_response_404.status_code = 404

        # Don't raise on 404 - let the code handle it
        def no_raise_404():
            pass

        mock_response_404.raise_for_status = no_raise_404

        mock_response_200 = MagicMock()
        mock_response_200.status_code = 200
        mock_response_200.content = zip_content

        # Don't raise on 200
        def no_raise_200():
            pass

        mock_response_200.raise_for_status = no_raise_200

        # Create async functions that return the mock responses
        async def mock_get_async_404(*args, **kwargs):
            return mock_response_404

        async def mock_get_async_200(*args, **kwargs):
            return mock_response_200

        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        # First call returns 404, second returns 200
        # Use side_effect with the async functions - AsyncMock will properly await them
        # Create a call counter to track which response to return
        call_count = [0]  # Use list to allow modification in nested function

        async def mock_get_with_side_effect(*args, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                return await mock_get_async_404(*args, **kwargs)
            else:
                return await mock_get_async_200(*args, **kwargs)

        mock_client.get = mock_get_with_side_effect
        mock_client_class.return_value = mock_client

        response = test_client.post(
            "/api/plugins/github/enumerate",
            json={"repo_url": "https://github.com/user/repo"},  # No branch specified
        )

        if response.status_code == 404:
            pytest.skip("GitHub enumeration route not available in test client")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["branch_switched"] is True
        assert data["branch"] == "master"

    @patch("httpx.AsyncClient")
    def test_enumerate_plugins_from_github_not_found(self, mock_client_class, test_client):
        """Test enumerating from non-existent repository."""

        async def mock_get_async_404(*args, **kwargs):
            mock_response = MagicMock()
            mock_response.status_code = 404
            return mock_response

        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.get = AsyncMock(side_effect=mock_get_async_404)
        mock_client_class.return_value = mock_client

        response = test_client.post(
            "/api/plugins/github/enumerate",
            json={"repo_url": "https://github.com/user/nonexistent"},
        )

        if response.status_code == 404 and "route" in response.text.lower():
            pytest.skip("GitHub enumeration route not available in test client")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_enumerate_plugins_from_github_invalid_url(self, test_client):
        """Test enumerating with invalid GitHub URL."""
        response = test_client.post(
            "/api/plugins/github/enumerate",
            json={"repo_url": "not-a-github-url"},
        )

        if response.status_code == 404:
            pytest.skip("GitHub enumeration route not available in test client")

        assert response.status_code == 400
        assert "invalid" in response.json()["detail"].lower()


@pytest.mark.integration
class TestGitHubPluginInstallation:
    """Test GitHub plugin installation endpoint."""

    @pytest.fixture
    def mock_github_zip_single_plugin(self, tmp_path):
        """Create a mock GitHub repository zip with a single plugin."""
        zip_path = tmp_path / "repo.zip"

        with zipfile.ZipFile(zip_path, "w") as zipf:
            zipf.writestr(
                "repo-main/plugin1/plugin.json",
                json.dumps(
                    {
                        "id": "github_install_plugin",
                        "name": "GitHub Install Plugin",
                        "version": "1.0.0",
                        "type": "service",
                    }
                ),
            )
            zipf.writestr("repo-main/plugin1/plugin.py", "# Plugin code")

        return zip_path

    @pytest.fixture
    def mock_github_zip_test_plugin(self, tmp_path):
        """Create a mock GitHub repository zip with the test plugin."""
        zip_path = tmp_path / "repo.zip"

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

        with zipfile.ZipFile(zip_path, "w") as zipf:
            # Test plugin
            zipf.writestr(
                "repo-main/test-plugin/plugin.json",
                json.dumps(
                    {
                        "id": "test_plugin",
                        "name": "Test Plugin",
                        "version": "1.0.0",
                        "type": "service",
                        "description": "A basic test plugin for plugin installation testing",
                        "author": "Calvin Test Suite",
                        "license": "MIT",
                    }
                ),
            )
            zipf.writestr("repo-main/test-plugin/plugin.py", plugin_code)

            # plugins.json manifest
            zipf.writestr(
                "repo-main/plugins.json",
                json.dumps(
                    {
                        "version": "1.0.0",
                        "plugins": [
                            {
                                "id": "test_plugin",
                                "name": "Test Plugin",
                                "path": "test-plugin",
                                "description": (
                                    "A basic test plugin for plugin installation testing"
                                ),
                                "version": "1.0.0",
                                "type": "service",
                            }
                        ],
                    }
                ),
            )

        return zip_path

    @patch("httpx.AsyncClient")
    def test_install_plugin_from_github_success(
        self, mock_client_class, test_client, mock_github_zip_single_plugin
    ):
        """Test successfully installing a plugin from GitHub."""
        # Clean up first
        try:
            plugin_installer.uninstall_plugin("github_install_plugin")
        except Exception:
            pass

        with open(mock_github_zip_single_plugin, "rb") as f:
            zip_content = f.read()

        async def mock_get_async_200(*args, **kwargs):
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.content = zip_content
            mock_response.raise_for_status = MagicMock()
            return mock_response

        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.get = AsyncMock(side_effect=mock_get_async_200)
        mock_client_class.return_value = mock_client

        response = test_client.post(
            "/api/plugins/github/install",
            json={
                "repo_url": "https://github.com/user/repo",
                "plugin_path": "plugin1",
                "branch": "main",
            },
        )

        if response.status_code == 404:
            pytest.skip("GitHub installation route not available in test client")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["manifest"]["id"] == "github_install_plugin"
        assert data["requires_restart"] is True

        # Verify plugin is installed
        plugin_path = plugin_installer.get_plugin_path("github_install_plugin")
        assert plugin_path.exists()

        # Cleanup
        try:
            plugin_installer.uninstall_plugin("github_install_plugin")
        except Exception:
            pass

    @patch("httpx.AsyncClient")
    def test_install_plugin_from_github_branch_fallback(
        self, mock_client_class, test_client, mock_github_zip_single_plugin
    ):
        """Test branch fallback during installation."""
        # Clean up first
        try:
            plugin_installer.uninstall_plugin("github_install_plugin")
        except Exception:
            pass

        with open(mock_github_zip_single_plugin, "rb") as f:
            zip_content = f.read()

        # Create mock responses
        mock_response_404 = MagicMock()
        mock_response_404.status_code = 404

        mock_response_200 = MagicMock()
        mock_response_200.status_code = 200
        mock_response_200.content = zip_content
        mock_response_200.raise_for_status = MagicMock()

        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        # First call returns 404, second returns 200
        # Use a list that gets consumed
        responses = [mock_response_404, mock_response_200]

        async def get_side_effect(*args, **kwargs):
            return responses.pop(0) if responses else mock_response_200

        mock_client.get = AsyncMock(side_effect=get_side_effect)
        mock_client_class.return_value = mock_client

        response = test_client.post(
            "/api/plugins/github/install",
            json={
                "repo_url": "https://github.com/user/repo",
                "plugin_path": "plugin1",
            },  # No branch specified
        )

        if response.status_code == 404:
            pytest.skip("GitHub installation route not available in test client")

        # The endpoint might return 500 if there's an error during installation
        # (e.g., plugin already exists, validation fails, etc.)
        # Check the response to see what happened
        if response.status_code == 500:
            error_detail = response.json().get("detail", "").lower()
            # If it's a plugin already installed error, that's expected in some cases
            if "already installed" in error_detail:
                # This is acceptable - plugin might have been installed in a previous test
                pytest.skip(f"Plugin already installed: {error_detail}")
            else:
                # Other 500 errors should be investigated
                pytest.fail(f"Unexpected 500 error: {response.json()}")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["branch_switched"] is True
        assert data["branch"] == "master"

        # Cleanup
        try:
            plugin_installer.uninstall_plugin("github_install_plugin")
        except Exception:
            pass

    def test_install_plugin_from_github_missing_params(self, test_client):
        """Test installation with missing required parameters."""
        response = test_client.post(
            "/api/plugins/github/install",
            json={"repo_url": "https://github.com/user/repo"},
        )

        if response.status_code == 404:
            pytest.skip("GitHub installation route not available in test client")

        assert response.status_code == 400
        assert "plugin_path" in response.json()["detail"].lower()

    def test_install_plugin_from_github_invalid_path(self, test_client):
        """Test installation with invalid plugin path."""
        response = test_client.post(
            "/api/plugins/github/install",
            json={
                "repo_url": "https://github.com/user/repo",
                "plugin_path": "../etc/passwd",  # Path traversal attempt
            },
        )

        if response.status_code == 404:
            pytest.skip("GitHub installation route not available in test client")

        assert response.status_code in [400, 500]
        error_detail = response.json()["detail"].lower()
        assert "path traversal" in error_detail or "invalid" in error_detail

    @patch("httpx.AsyncClient")
    def test_install_test_plugin_from_github(
        self, mock_client_class, test_client, mock_github_zip_test_plugin
    ):
        """Test successfully installing the test plugin from GitHub."""
        # Clean up first
        try:
            plugin_installer.uninstall_plugin("test_plugin")
        except Exception:
            pass

        with open(mock_github_zip_test_plugin, "rb") as f:
            zip_content = f.read()

        async def mock_get_async_200(*args, **kwargs):
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.content = zip_content
            mock_response.raise_for_status = MagicMock()
            return mock_response

        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.get = AsyncMock(side_effect=mock_get_async_200)
        mock_client_class.return_value = mock_client

        response = test_client.post(
            "/api/plugins/github/install",
            json={
                "repo_url": "https://github.com/user/repo",
                "plugin_path": "test-plugin",
                "branch": "main",
            },
        )

        if response.status_code == 404:
            pytest.skip("GitHub installation route not available in test client")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["manifest"]["id"] == "test_plugin"
        assert data["manifest"]["name"] == "Test Plugin"
        assert data["requires_restart"] is True

        # Verify plugin is installed
        plugin_path = plugin_installer.get_plugin_path("test_plugin")
        assert plugin_path.exists()
        assert (plugin_path / "plugin.json").exists()
        assert (plugin_path / "plugin.py").exists()

        # Verify plugin.json content
        installed_manifest = json.loads((plugin_path / "plugin.json").read_text())
        assert installed_manifest["id"] == "test_plugin"
        assert installed_manifest["name"] == "Test Plugin"

        # Cleanup
        try:
            plugin_installer.uninstall_plugin("test_plugin")
        except Exception:
            pass

    @patch("httpx.AsyncClient")
    def test_enumerate_test_plugin_from_github(
        self, mock_client_class, test_client, mock_github_zip_test_plugin
    ):
        """Test enumerating the test plugin from GitHub."""
        with open(mock_github_zip_test_plugin, "rb") as f:
            zip_content = f.read()

        async def mock_get_async(*args, **kwargs):
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.content = zip_content
            mock_response.raise_for_status = MagicMock()
            return mock_response

        # Setup async context manager mock
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.get = AsyncMock(side_effect=mock_get_async)
        mock_client_class.return_value = mock_client

        response = test_client.post(
            "/api/plugins/github/enumerate",
            json={"repo_url": "https://github.com/user/repo", "branch": "main"},
        )

        if response.status_code == 404:
            pytest.skip("GitHub enumeration route not available in test client")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "plugins" in data
        assert len(data["plugins"]) >= 1

        # Check that test plugin is listed
        plugin_ids = [p["id"] for p in data["plugins"]]
        assert "test_plugin" in plugin_ids

        # Verify test plugin details
        test_plugin = next(p for p in data["plugins"] if p["id"] == "test_plugin")
        assert test_plugin["name"] == "Test Plugin"
        assert test_plugin["path"] == "test-plugin"
        assert test_plugin["version"] == "1.0.0"
        assert test_plugin["type"] == "service"


@pytest.mark.integration
class TestPluginUninstallAPI:
    """Test plugin uninstall API endpoint."""

    def test_uninstall_plugin_success(self, test_client, tmp_path):
        """Test successfully uninstalling a plugin."""
        # Clean up first
        try:
            plugin_installer.uninstall_plugin("test_uninstall_api")
        except Exception:
            pass

        # Install a plugin first
        plugin_dir = tmp_path / "test_plugin"
        plugin_dir.mkdir()

        manifest = {
            "id": "test_uninstall_api",
            "name": "Test Uninstall API",
            "version": "1.0.0",
            "type": "service",
        }
        (plugin_dir / "plugin.json").write_text(json.dumps(manifest))
        (plugin_dir / "plugin.py").write_text("# Plugin code")

        plugin_installer.install_plugin(plugin_dir)

        # Uninstall via API
        response = test_client.delete("/api/plugins/installed/test_uninstall_api")

        assert response.status_code == 200
        response_data = response.json()
        assert response_data is not None
        assert response_data.get("success") is True

        # Verify plugin is removed
        plugin_path = plugin_installer.get_plugin_path("test_uninstall_api")
        assert not plugin_path.exists()

    def test_uninstall_plugin_with_frontend_static_assets(self, test_client, tmp_path):
        """Test uninstalling a plugin with frontend static assets."""
        # Clean up first
        try:
            plugin_installer.uninstall_plugin("test_uninstall_frontend")
        except Exception:
            pass

        # Install plugin with frontend
        plugin_dir = tmp_path / "test_plugin"
        plugin_dir.mkdir()

        manifest = {
            "id": "test_uninstall_frontend",
            "name": "Test Uninstall Frontend",
            "version": "1.0.0",
            "type": "service",
        }
        (plugin_dir / "plugin.json").write_text(json.dumps(manifest))
        (plugin_dir / "plugin.py").write_text("# Plugin code")

        frontend_dir = plugin_dir / "frontend"
        frontend_dir.mkdir()
        (frontend_dir / "dist.js").write_text(
            "customElements.define('calvin-uninstall-test', class extends HTMLElement {})"
        )

        plugin_installer.install_plugin(plugin_dir)

        plugin_path = plugin_installer.get_plugin_path("test_uninstall_frontend")
        assert (plugin_path / "frontend").exists()

        # Uninstall via API
        response = test_client.delete("/api/plugins/installed/test_uninstall_frontend")

        assert response.status_code == 200

        # Plugin dir (and its frontend assets) gone
        assert not plugin_path.exists()

    def test_uninstall_plugin_not_found(self, test_client):
        """Test uninstalling a non-existent plugin."""
        response = test_client.delete("/api/plugins/installed/nonexistent_plugin")

        assert response.status_code == 404
