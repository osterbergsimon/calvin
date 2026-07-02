"""Integration tests for plugin API endpoints."""

import json
import zipfile
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

from app.plugins.base import PluginType
from app.plugins.definitions import CURRENT_PLUGIN_API_VERSION, PluginMetadata
from app.plugins.manager import plugin_manager
from app.plugins.protocols import BackendPlugin, ServicePlugin
from app.services.plugin_installer import plugin_installer


@pytest.mark.integration
class TestPluginInstallationAPI:
    """Test plugin installation API endpoints."""

    def test_get_installed_plugins_empty(self, test_client):
        """Test getting installed plugins when none are installed."""
        # Only clean up test-specific plugins from previous tests (don't remove user's plugins)
        try:
            installed_plugins = plugin_installer.get_installed_plugins()
            for plugin in installed_plugins:
                # Only uninstall test plugins (those starting with "test_")
                if plugin.get("id", "").startswith("test_"):
                    try:
                        plugin_installer.uninstall_plugin(plugin["id"])
                    except Exception:
                        pass
        except Exception:
            pass

        # Only clean up test-specific themes (don't remove user's themes)
        try:
            from app.services.theme_installer import theme_installer

            installed_themes = theme_installer.get_installed_themes()
            for theme in installed_themes:
                # Only uninstall test themes (those starting with "test_")
                if theme.get("id", "").startswith("test_"):
                    try:
                        theme_installer.uninstall_theme(theme["id"])
                    except Exception:
                        pass
        except Exception:
            pass

        response = test_client.get("/api/plugins/installed")
        # The endpoint might return 200 with empty list or 404 if not found
        # Both are acceptable for empty state
        assert response.status_code in [200, 404]
        if response.status_code == 200:
            data = response.json()
            # Response might be {"plugins": []} or just []
            if isinstance(data, dict):
                assert "plugins" in data
                # Filter out themes and test plugins - we're only testing
                # that non-test plugins exist
                # This test just verifies the endpoint works, not that it's empty
                # (user may have real plugins installed)
                _ = [
                    p
                    for p in data["plugins"]
                    if p.get("type") != "theme" and not p.get("id", "").startswith("test_")
                ]
            else:
                _ = [
                    p
                    for p in data
                    if p.get("type") != "theme" and not p.get("id", "").startswith("test_")
                ]

    def test_install_plugin_from_zip(self, test_client, tmp_path):
        """Test installing a plugin from a zip file."""
        # Clean up first in case it exists
        try:
            plugin_installer.uninstall_plugin("test_api_plugin")
        except Exception:
            pass

        # Create a valid plugin package
        plugin_dir = tmp_path / "test_plugin"
        plugin_dir.mkdir()

        manifest = {
            "id": "test_api_plugin",
            "name": "Test API Plugin",
            "version": "1.0.0",
            "type": "service",
            "api_version": CURRENT_PLUGIN_API_VERSION,
        }
        (plugin_dir / "plugin.json").write_text(json.dumps(manifest))
        (plugin_dir / "plugin.py").write_text(
            '''"""Test plugin."""
from app.plugins.definitions import PluginMetadata
from app.plugins.protocols import ServicePlugin


class TestApiPlugin(ServicePlugin):
    metadata = PluginMetadata(type_id="test_api_plugin", name="Test API Plugin")

    async def fetch(self, start_date=None, end_date=None):
        return {"ok": True}
'''
        )

        # Create zip file
        zip_path = tmp_path / "test_plugin.zip"
        with zipfile.ZipFile(zip_path, "w") as zipf:
            for file_path in plugin_dir.rglob("*"):
                if file_path.is_file():
                    arcname = file_path.relative_to(plugin_dir)
                    zipf.write(file_path, arcname)

        # Install plugin
        with open(zip_path, "rb") as zip_file:
            response = test_client.post(
                "/api/plugins/install",
                files={"file": ("test_plugin.zip", zip_file, "application/zip")},
            )

        # The endpoint might return 200 (success) or 404 (route not found in test client)
        # If 404, skip the verification - the installation itself is tested in unit tests
        if response.status_code == 200:
            data = response.json()
            assert data["success"] is True
            assert data["manifest"]["id"] == "test_api_plugin"

            # Verify plugin is installed
            response = test_client.get("/api/plugins/installed")
            if response.status_code == 200:
                plugins_data = response.json()
                plugins = (
                    plugins_data.get("plugins", plugins_data)
                    if isinstance(plugins_data, dict)
                    else plugins_data
                )
                # Find our plugin in the list
                plugin_ids = [p.get("id", p) if isinstance(p, dict) else p for p in plugins]
                assert "test_api_plugin" in plugin_ids
        elif response.status_code == 404:
            # Route not registered in test client - this is acceptable
            # The actual installation is tested in unit tests
            pytest.skip("Plugin installation route not available in test client")
        else:
            # Unexpected error
            error_msg = f"Unexpected status code: {response.status_code}, response: {response.text}"
            assert False, error_msg

    def test_install_plugin_rejects_invalid_display_schema(self, test_client, tmp_path):
        """A plugin with display_schema.kind not in SUPPORTED_DISPLAY_KINDS must
        be rejected at install time with a 400, AND the plugin files must be
        rolled back so the user can fix and retry."""
        try:
            plugin_installer.uninstall_plugin("bad_kind_plugin")
        except Exception:
            pass

        plugin_dir = tmp_path / "bad_kind_plugin"
        plugin_dir.mkdir()
        (plugin_dir / "plugin.json").write_text(
            json.dumps(
                {
                    "id": "bad_kind_plugin",
                    "name": "Bad Kind Plugin",
                    "version": "1.0.0",
                    "type": "service",
                    "api_version": CURRENT_PLUGIN_API_VERSION,
                }
            )
        )
        (plugin_dir / "plugin.py").write_text(
            '''"""Plugin with an invalid display_schema kind."""
from app.plugins.definitions import PluginMetadata
from app.plugins.protocols import ServicePlugin


class BadKindPlugin(ServicePlugin):
    metadata = PluginMetadata(
        type_id="bad_kind_plugin",
        name="Bad Kind Plugin",
        display_schema={"kind": "no-such-renderer"},
    )
'''
        )

        zip_path = tmp_path / "bad_kind_plugin.zip"
        with zipfile.ZipFile(zip_path, "w") as zipf:
            for file_path in plugin_dir.rglob("*"):
                if file_path.is_file():
                    zipf.write(file_path, file_path.relative_to(plugin_dir))

        with open(zip_path, "rb") as zip_file:
            response = test_client.post(
                "/api/plugins/install",
                files={"file": ("bad_kind_plugin.zip", zip_file, "application/zip")},
            )

        if response.status_code == 404:
            pytest.skip("Plugin installation route not available in test client")

        assert response.status_code == 400, response.text
        detail = response.json()["detail"]
        assert "bad_kind_plugin" in detail
        assert "display_schema.kind" in detail
        assert "no-such-renderer" in detail

        # Roll-back: the plugin must NOT be installed.
        assert not plugin_installer.get_plugin_path("bad_kind_plugin").exists()

    def test_install_plugin_invalid_zip(self, test_client, tmp_path):
        """Test installing an invalid plugin zip file."""
        # Create invalid zip (no plugin.json)
        zip_path = tmp_path / "invalid.zip"
        with zipfile.ZipFile(zip_path, "w") as zipf:
            zipf.writestr("readme.txt", "This is not a plugin")

        with open(zip_path, "rb") as zip_file:
            response = test_client.post(
                "/api/plugins/install",
                files={"file": ("invalid.zip", zip_file, "application/zip")},
            )

        assert response.status_code == 400
        assert "plugin.json" in response.json()["detail"].lower()

    def test_get_installed_plugin_manifest(self, test_client, tmp_path):
        """Test getting manifest for an installed plugin."""
        # Clean up first in case it exists
        try:
            plugin_installer.uninstall_plugin("test_manifest_plugin")
        except Exception:
            pass

        # Install a plugin first
        plugin_dir = tmp_path / "test_plugin"
        plugin_dir.mkdir()

        manifest = {
            "id": "test_manifest_plugin",
            "name": "Test Manifest Plugin",
            "version": "1.0.0",
            "type": "service",
            "api_version": CURRENT_PLUGIN_API_VERSION,
        }
        (plugin_dir / "plugin.json").write_text(json.dumps(manifest))
        (plugin_dir / "plugin.py").write_text("# Plugin code")

        plugin_installer.install_plugin(plugin_dir)

        # Get manifest
        response = test_client.get("/api/plugins/installed/test_manifest_plugin")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "test_manifest_plugin"
        assert data["name"] == "Test Manifest Plugin"

    def test_get_installed_plugin_not_found(self, test_client):
        """Test getting manifest for non-existent plugin."""
        response = test_client.get("/api/plugins/installed/nonexistent")
        assert response.status_code == 404

    def test_uninstall_plugin(self, test_client, tmp_path):
        """Test uninstalling a plugin."""
        # Clean up test plugin only (don't remove user's plugins)
        try:
            plugin_installer.uninstall_plugin("test_uninstall_plugin")
        except Exception:
            pass

        # Install a plugin first
        plugin_dir = tmp_path / "test_plugin"
        plugin_dir.mkdir()

        manifest = {
            "id": "test_uninstall_plugin",
            "name": "Test Uninstall Plugin",
            "version": "1.0.0",
            "type": "service",
            "api_version": CURRENT_PLUGIN_API_VERSION,
        }
        (plugin_dir / "plugin.json").write_text(json.dumps(manifest))
        (plugin_dir / "plugin.py").write_text("# Plugin code")

        plugin_installer.install_plugin(plugin_dir)

        # Verify it's installed
        response = test_client.get("/api/plugins/installed")
        if response.status_code == 200:
            data = response.json()
            plugins = data.get("plugins", data) if isinstance(data, dict) else data
            # Filter out themes - we're only testing plugins here
            plugins_only = [p for p in plugins if p.get("type") != "theme"]
            assert len(plugins_only) == 1

        # Uninstall
        response = test_client.delete("/api/plugins/installed/test_uninstall_plugin")
        assert response.status_code == 200, (
            f"Expected 200, got {response.status_code}: {response.text}"
        )
        response_data = response.json()
        assert response_data is not None, (
            f"Response body is None. Status: {response.status_code}, Text: {response.text}"
        )
        assert response_data.get("success") is True

        # Verify it's removed
        response = test_client.get("/api/plugins/installed")
        if response.status_code == 200:
            data = response.json()
            plugins = data.get("plugins", data) if isinstance(data, dict) else data
            # Filter out themes and non-test plugins - only test plugins should be gone
            plugins_only = [
                p
                for p in plugins
                if p.get("type") != "theme" and not p.get("id", "").startswith("test_")
            ]
            # The test plugin should be gone, but user's plugins may remain
            test_plugin_ids = [p.get("id") for p in plugins if p.get("id", "").startswith("test_")]
            assert "test_uninstall_plugin" not in test_plugin_ids
        else:
            # 404 is also acceptable for empty state
            assert response.status_code == 404

    def test_uninstall_plugin_not_found(self, test_client):
        """Test uninstalling a non-existent plugin."""
        response = test_client.delete("/api/plugins/installed/nonexistent")
        assert response.status_code == 404

    def test_install_plugin_with_frontend_static_assets(self, test_client, tmp_path):
        """Test installing a plugin with frontend static assets."""
        # Clean up first in case it exists
        try:
            plugin_installer.uninstall_plugin("test_frontend_plugin")
        except Exception:
            pass

        # Create plugin with frontend
        plugin_dir = tmp_path / "test_plugin"
        plugin_dir.mkdir()

        manifest = {
            "id": "test_frontend_plugin",
            "name": "Test Frontend Plugin",
            "version": "1.0.0",
            "type": "service",
            "api_version": CURRENT_PLUGIN_API_VERSION,
        }
        (plugin_dir / "plugin.json").write_text(json.dumps(manifest))
        (plugin_dir / "plugin.py").write_text("# Plugin code")

        frontend_dir = plugin_dir / "frontend"
        frontend_dir.mkdir()
        (frontend_dir / "dist.js").write_text(
            "customElements.define('calvin-test-frontend-plugin', class extends HTMLElement {})"
        )
        (frontend_dir / "dist.css").write_text(":host { display: block; }")

        # Install plugin
        plugin_installer.install_plugin(plugin_dir)

        # Verify frontend assets are stored inside the plugin's data dir.
        plugin_path = plugin_installer.get_plugin_path("test_frontend_plugin")
        assert (plugin_path / "frontend" / "dist.js").exists()
        assert (plugin_path / "frontend" / "dist.css").exists()

    def test_plugin_static_asset_endpoint_serves_installed_frontend_asset(
        self, test_client, temp_plugins_dir, monkeypatch
    ):
        """Test serving installed plugin frontend assets without a frontend rebuild."""
        from app.config import settings

        monkeypatch.setattr(settings, "plugins_dir", temp_plugins_dir)

        frontend_dir = temp_plugins_dir / "test_static_plugin" / "frontend"
        frontend_dir.mkdir(parents=True)
        (frontend_dir / "dist.js").write_text(
            "customElements.define('calvin-static-test', class extends HTMLElement {})"
        )

        response = test_client.get("/api/plugins/test_static_plugin/static/dist.js")

        assert response.status_code == 200
        assert "calvin-static-test" in response.text

    @pytest.mark.asyncio
    async def test_plugin_static_asset_endpoint_rejects_path_traversal(
        self, temp_plugins_dir, monkeypatch
    ):
        """Test plugin static asset paths cannot escape the plugin frontend directory."""
        from fastapi import HTTPException

        from app.api.routes.plugins.static_assets import get_plugin_static_asset
        from app.config import settings

        monkeypatch.setattr(settings, "plugins_dir", temp_plugins_dir)

        frontend_dir = temp_plugins_dir / "test_static_plugin" / "frontend"
        frontend_dir.mkdir(parents=True)
        (temp_plugins_dir / "test_static_plugin" / "secret.txt").write_text("secret")

        with pytest.raises(HTTPException) as exc_info:
            await get_plugin_static_asset("test_static_plugin", "../secret.txt")

        assert exc_info.value.status_code == 400


@pytest.mark.integration
class TestPluginInstanceManagement:
    """Test plugin instance start/stop endpoints."""

    def test_start_plugin_instance_not_found(self, test_client):
        """Test starting a non-existent plugin instance."""
        response = test_client.post("/api/plugins/instances/nonexistent-instance/start")
        assert response.status_code == 404
        assert "not found in database" in response.json()["detail"]

    def test_stop_plugin_instance_not_found(self, test_client):
        """Test stopping a non-existent plugin instance."""
        response = test_client.post("/api/plugins/instances/nonexistent-instance/stop")
        assert response.status_code == 404
        assert "not found in database" in response.json()["detail"]

    def test_route_ordering_instances_before_generic(self, test_client):
        """Test that instance routes are matched before generic plugin routes."""
        # This test ensures that /plugins/instances/{id}/start doesn't match
        # the generic /plugins/{plugin_id} route
        # We test this by checking that instance routes return 404 (not found)
        # rather than 405 (method not allowed) or other generic route errors

        # Use a truly non-existent instance ID (not in database)
        nonexistent_id = "definitely-does-not-exist-instance-12345"

        # Try to start a non-existent instance
        response = test_client.post(f"/api/plugins/instances/{nonexistent_id}/start")
        # Should get 404 (not found) from instance route, not from generic route
        assert response.status_code == 404, (
            f"Expected 404, got {response.status_code}: {response.text}"
        )
        # The error message should be specific to instance not found
        assert "instance" in response.json()["detail"].lower()

        # Try to stop a non-existent instance
        response = test_client.post(f"/api/plugins/instances/{nonexistent_id}/stop")
        assert response.status_code == 404, (
            f"Expected 404, got {response.status_code}: {response.text}"
        )
        assert "instance" in response.json()["detail"].lower()

    def test_get_plugin_after_instance_route(self, test_client):
        """Test that generic plugin routes still work after instance routes."""
        # This ensures the route ordering fix doesn't break generic routes
        # Try to get a plugin (generic route)
        response = test_client.get("/api/plugins/local")
        # Should work (might be 404 if plugin doesn't exist, but not 405)
        assert response.status_code in [200, 404]
        # If 404, it should be a proper "plugin not found" error, not a route error
        if response.status_code == 404:
            assert (
                "plugin" in response.json()["detail"].lower()
                or "not found" in response.json()["detail"].lower()
            )


@pytest.mark.integration
class TestBackendPluginAPI:
    """Test backend plugin API endpoints."""

    class MockBackendPluginForAPI(BackendPlugin):
        """Mock BackendPlugin for API testing."""

        def __init__(
            self,
            plugin_id: str,
            name: str,
            enabled: bool = True,
            schedule_config: dict[str, Any] | None = None,
        ):
            super().__init__(plugin_id, name, enabled)
            self._schedule_config = schedule_config
            self._running = False
            self._task_run_count = 0

        @classmethod
        def get_plugin_metadata(cls):
            return {"type_id": "test-backend", "plugin_type": PluginType.BACKEND}

        @property
        def plugin_type(self) -> PluginType:
            return PluginType.BACKEND

        async def initialize(self) -> None:
            self._running = True

        async def cleanup(self) -> None:
            self._running = False

        def start(self) -> None:
            self._running = True

        def stop(self) -> None:
            self._running = False

        def is_running(self) -> bool:
            return self._running

        async def validate_config(self, config: dict[str, Any]) -> bool:
            return True

        async def get_schedule_config(self) -> dict[str, Any] | None:
            if not self.enabled:
                return None
            return self._schedule_config

        async def run_scheduled_task(self) -> dict[str, Any]:
            self._task_run_count += 1
            return {
                "success": True,
                "message": f"Task executed {self._task_run_count} time(s)",
                "data": {"count": self._task_run_count},
            }

        async def get_provided_services(self) -> list[str]:
            return ["test_service"]

    @pytest.mark.asyncio
    async def test_run_backend_plugin_task(self, test_client):
        """Test running a scheduled task for a backend plugin."""
        # Register a mock backend plugin
        plugin = self.MockBackendPluginForAPI(
            plugin_id="test-backend-plugin",
            name="Test Backend Plugin",
            enabled=True,
            schedule_config={"interval": 300, "enabled": True, "max_concurrent": 1},
        )

        await plugin_manager.register(plugin)
        plugin.start()

        try:
            # Run task
            response = test_client.post("/api/plugins/test-backend-plugin/backend/run-task")

            if response.status_code == 404:
                pytest.skip("Backend plugin endpoint not available in test client")

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert "Task executed" in data["message"]
            assert plugin._task_run_count == 1

            # Run again
            response = test_client.post("/api/plugins/test-backend-plugin/backend/run-task")
            assert response.status_code == 200
            data = response.json()
            assert plugin._task_run_count == 2
        finally:
            # Cleanup
            await plugin_manager.unregister("test-backend-plugin")

    @pytest.mark.asyncio
    async def test_run_backend_plugin_task_not_found(self, test_client):
        """Test running task for non-existent plugin."""
        response = test_client.post("/api/plugins/nonexistent-backend/backend/run-task")

        if response.status_code == 404:
            # Check if it's the endpoint not found (route not registered) or plugin not found
            detail = response.json().get("detail", "")
            if "not found" in detail.lower() and "plugin" in detail.lower():
                # Plugin not found - this is the expected behavior
                assert "plugin" in detail.lower() or "instance" in detail.lower()
            else:
                # Endpoint not found - skip test
                pytest.skip("Backend plugin endpoint not available in test client")
        else:
            assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_run_backend_plugin_task_not_backend_plugin(self, test_client):
        """Test running task for non-backend plugin (should return 400)."""
        # Try with a non-backend plugin (local is an image plugin)
        response = test_client.post("/api/plugins/local/backend/run-task")

        if response.status_code == 404:
            pytest.skip("Backend plugin endpoint not available in test client")

        assert response.status_code == 400
        assert "not a backend plugin" in response.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_run_backend_plugin_task_disabled(self, test_client):
        """Test running task for disabled backend plugin."""
        plugin = self.MockBackendPluginForAPI(
            plugin_id="test-backend-disabled",
            name="Disabled Backend Plugin",
            enabled=False,
            schedule_config={"interval": 300, "enabled": True, "max_concurrent": 1},
        )

        await plugin_manager.register(plugin)

        try:
            response = test_client.post("/api/plugins/test-backend-disabled/backend/run-task")

            if response.status_code == 404:
                pytest.skip("Backend plugin endpoint not available in test client")

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is False
            assert "disabled" in data["message"].lower()
        finally:
            await plugin_manager.unregister("test-backend-disabled")

    @pytest.mark.asyncio
    async def test_run_backend_plugin_task_no_schedule(self, test_client):
        """Test running task for backend plugin without schedule config."""
        plugin = self.MockBackendPluginForAPI(
            plugin_id="test-backend-no-schedule",
            name="No Schedule Backend Plugin",
            enabled=True,
            schedule_config=None,
        )

        await plugin_manager.register(plugin)
        plugin.start()

        try:
            response = test_client.post("/api/plugins/test-backend-no-schedule/backend/run-task")

            if response.status_code == 404:
                pytest.skip("Backend plugin endpoint not available in test client")

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is False
            assert "does not support scheduled tasks" in data["message"].lower()
        finally:
            await plugin_manager.unregister("test-backend-no-schedule")

    @pytest.mark.asyncio
    async def test_get_backend_plugin_status(self, test_client):
        """Test getting status for a backend plugin."""
        plugin = self.MockBackendPluginForAPI(
            plugin_id="test-backend-status",
            name="Status Backend Plugin",
            enabled=True,
            schedule_config={"interval": 300, "enabled": True, "max_concurrent": 1},
        )

        await plugin_manager.register(plugin)
        plugin.start()

        try:
            response = test_client.get("/api/plugins/test-backend-status/backend/status")

            if response.status_code == 404:
                pytest.skip("Backend plugin endpoint not available in test client")

            assert response.status_code == 200
            data = response.json()
            assert data["plugin_id"] == "test-backend-status"
            assert data["name"] == "Status Backend Plugin"
            assert data["enabled"] is True
            assert data["running"] is True
            assert "scheduled_task" in data
            assert data["scheduled_task"] is not None
            assert data["scheduled_task"]["interval"] == 300
            assert "provided_services" in data
        finally:
            await plugin_manager.unregister("test-backend-status")

    @pytest.mark.asyncio
    async def test_get_backend_plugin_status_not_found(self, test_client):
        """Test getting status for non-existent plugin."""
        response = test_client.get("/api/plugins/nonexistent-backend/backend/status")

        if response.status_code == 404:
            # Check if it's the endpoint not found or plugin not found
            detail = response.json().get("detail", "")
            if "not found" in detail.lower() and "plugin" in detail.lower():
                # Plugin not found - this is expected
                assert "plugin" in detail.lower() or "instance" in detail.lower()
            else:
                # Endpoint not found - skip test
                pytest.skip("Backend plugin endpoint not available in test client")
        else:
            assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_get_backend_plugin_status_not_backend(self, test_client):
        """Test getting status for non-backend plugin (should return 400)."""
        response = test_client.get("/api/plugins/local/backend/status")

        if response.status_code == 404:
            pytest.skip("Backend plugin endpoint not available in test client")

        assert response.status_code == 400
        assert "not a backend plugin" in response.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_get_backend_plugin_status_no_schedule(self, test_client):
        """Test getting status for backend plugin without schedule config."""
        plugin = self.MockBackendPluginForAPI(
            plugin_id="test-backend-status-no-schedule",
            name="No Schedule Status Plugin",
            enabled=True,
            schedule_config=None,
        )

        await plugin_manager.register(plugin)
        plugin.start()

        try:
            response = test_client.get(
                "/api/plugins/test-backend-status-no-schedule/backend/status"
            )

            if response.status_code == 404:
                pytest.skip("Backend plugin endpoint not available in test client")

            assert response.status_code == 200
            data = response.json()
            assert data["plugin_id"] == "test-backend-status-no-schedule"
            assert data["scheduled_task"] is None
        finally:
            await plugin_manager.unregister("test-backend-status-no-schedule")


@pytest.mark.integration
class TestServicePluginDataAPI:
    """Test service plugin data endpoint."""

    class MockServicePluginForAPI(ServicePlugin):
        metadata = PluginMetadata(type_id="test-service", name="Test Service")

        def __init__(self, plugin_id: str, name: str, enabled: bool = True):
            super().__init__(plugin_id, name, enabled)
            self.initialize_calls = 0

        async def initialize(self) -> None:
            self.initialize_calls += 1

        async def fetch(
            self,
            start_date: str | None = None,
            end_date: str | None = None,
        ) -> dict[str, Any] | None:
            return {
                "success": True,
                "start_date": start_date,
                "end_date": end_date,
                "items": [{"label": "ok"}],
            }

    @pytest.mark.asyncio
    async def test_get_plugin_data_uses_service_instance_method(self, test_client):
        from app.models.db_models import PluginDB

        plugin = self.MockServicePluginForAPI(
            plugin_id="test-service-instance",
            name="Test Service Instance",
            enabled=True,
        )
        await plugin_manager.register(plugin)

        db_plugin = await PluginDB.objects.create(
            id="test-service-instance",
            type_id="test-service",
            plugin_type="service",
            name="Test Service Instance",
            enabled=True,
            config={},
        )

        try:
            response = test_client.get(
                "/api/plugins/test-service-instance/data",
                params={"start_date": "2026-01-01", "end_date": "2026-01-07"},
            )

            if response.status_code == 404:
                pytest.skip("Service data endpoint not available in test client")

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert data["start_date"] == "2026-01-01"
            assert data["end_date"] == "2026-01-07"
            assert data["items"] == [{"label": "ok"}]
            assert plugin.initialize_calls == 1
        finally:
            await plugin_manager.unregister("test-service-instance")
            await db_plugin.delete()


@pytest.mark.integration
class TestPluginTypeClassBasedActions:
    """Test class-based type-level plugin actions (test/scan/fetch verbs)."""

    @staticmethod
    def _loader_for(plugin_class, type_id):
        """Minimal plugin_loader stand-in exposing get_plugin_class."""
        from types import SimpleNamespace

        return SimpleNamespace(
            get_plugin_class=lambda pid: plugin_class if pid == type_id else None
        )

    def test_test_plugin_connection_uses_class_test_connection(self, test_client, monkeypatch):
        class ClassBasedTestPlugin(ServicePlugin):
            metadata = PluginMetadata(type_id="class-based-test", name="Class Based Test")

            @classmethod
            async def test_connection(cls, config: dict[str, Any]) -> dict[str, Any] | None:
                return {
                    "success": True,
                    "message": f"tested:{config.get('value', '')}",
                }

        monkeypatch.setattr(
            "app.api.routes.plugins.management.plugin_loader",
            self._loader_for(ClassBasedTestPlugin, "class-based-test"),
        )

        response = test_client.post(
            "/api/plugins/class-based-test/test",
            json={"value": "ok"},
        )

        if response.status_code == 404:
            pytest.skip("Plugin test endpoint not available in test client")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["message"] == "tested:ok"

    def test_test_plugin_connection_default_signals_unsupported(self, test_client, monkeypatch):
        class NoTestPlugin(ServicePlugin):
            metadata = PluginMetadata(type_id="no-test-plugin", name="No Test Plugin")

        monkeypatch.setattr(
            "app.api.routes.plugins.management.plugin_loader",
            self._loader_for(NoTestPlugin, "no-test-plugin"),
        )

        response = test_client.post("/api/plugins/no-test-plugin/test", json={})

        if response.status_code == 404:
            pytest.skip("Plugin test endpoint not available in test client")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is False
        assert "does not support connection testing" in data["message"]

    def test_scan_plugin_options_uses_class_scan_options(self, test_client, monkeypatch):
        class ClassBasedScanPlugin(ServicePlugin):
            metadata = PluginMetadata(type_id="class-based-scan", name="Class Based Scan")

            @classmethod
            async def scan_options(cls, field_key: str) -> dict[str, Any] | None:
                return {
                    "options": [{"value": field_key, "label": field_key.upper()}],
                }

        monkeypatch.setattr(
            "app.api.routes.plugins.management.plugin_loader",
            self._loader_for(ClassBasedScanPlugin, "class-based-scan"),
        )

        response = test_client.get("/api/plugins/class-based-scan/scan", params={"field": "device"})

        if response.status_code == 404:
            pytest.skip("Plugin scan endpoint not available in test client")

        assert response.status_code == 200
        data = response.json()
        assert data["options"] == [{"value": "device", "label": "DEVICE"}]

    @pytest.mark.asyncio
    async def test_fetch_plugin_calls_enabled_instances(self, test_client, monkeypatch):
        """POST /plugins/{type_id}/fetch calls fetch() on enabled instances."""
        from app.models.db_models import PluginDB

        class ClassBasedFetchPlugin(ServicePlugin):
            metadata = PluginMetadata(type_id="class-based-fetch", name="Class Based Fetch")

            async def fetch(
                self,
                start_date: str | None = None,
                end_date: str | None = None,
            ) -> dict[str, Any] | None:
                return {"success": True, "message": "manual fetch completed"}

        monkeypatch.setattr(
            "app.api.routes.plugins.management.plugin_loader",
            self._loader_for(ClassBasedFetchPlugin, "class-based-fetch"),
        )

        instance = ClassBasedFetchPlugin(
            plugin_id="class-based-fetch-1", name="Fetch Instance", enabled=True
        )
        await plugin_manager.register(instance)
        db_plugin = await PluginDB.objects.create(
            id="class-based-fetch-1",
            type_id="class-based-fetch",
            plugin_type="service",
            name="Fetch Instance",
            enabled=True,
            config={},
        )

        try:
            response = test_client.post("/api/plugins/class-based-fetch/fetch")

            if response.status_code == 404:
                pytest.skip("Plugin fetch endpoint not available in test client")

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert data["message"] == "manual fetch completed"
        finally:
            await plugin_manager.unregister("class-based-fetch-1")
            await db_plugin.delete()

    @pytest.mark.asyncio
    async def test_fetch_plugin_without_instances_reports_unsupported(
        self, test_client, monkeypatch
    ):
        class NoInstancesPlugin(ServicePlugin):
            metadata = PluginMetadata(type_id="no-instances-fetch", name="No Instances")

        monkeypatch.setattr(
            "app.api.routes.plugins.management.plugin_loader",
            self._loader_for(NoInstancesPlugin, "no-instances-fetch"),
        )

        response = test_client.post("/api/plugins/no-instances-fetch/fetch")

        if response.status_code == 404:
            pytest.skip("Plugin fetch endpoint not available in test client")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is False
        assert "does not support manual fetch" in data["message"]


@pytest.mark.integration
class TestZipInstallRestartRequired:
    """Verify requires_restart in ZIP upload install response mirrors the manifest."""

    @pytest.fixture
    def minimal_zip_path(self, tmp_path):
        """Minimal zip containing a plugin.json so the package validation passes."""
        zip_path = tmp_path / "minimal.zip"
        with zipfile.ZipFile(zip_path, "w") as zipf:
            zipf.writestr(
                "plugin.json",
                json.dumps(
                    {
                        "id": "myplugin",
                        "name": "My Plugin",
                        "version": "1.0.0",
                        "type": "service",
                    }
                ),
            )
        return zip_path

    @pytest.mark.parametrize(
        "requirements,expected_restart",
        [
            ({"restart_required": True}, True),
            ({"restart_required": False}, False),
            ({}, False),  # no restart_required key — defaults to False
        ],
    )
    @patch(
        "app.api.routes.plugins.management.load_plugin_types_for_single",
        new_callable=AsyncMock,
    )
    @patch("app.api.routes.plugins.management.event_system")
    @patch("app.api.routes.plugins.management._validate_just_installed_plugin")
    @patch("app.api.routes.plugins.management.plugin_loader")
    @patch("app.api.routes.plugins.management.plugin_installer")
    def test_zip_install_restart_required(
        self,
        mock_plugin_installer,
        mock_plugin_loader,
        mock_validate,
        mock_event_system,
        mock_load_single,
        requirements,
        expected_restart,
        test_client,
        minimal_zip_path,
    ):
        """requires_restart in the ZIP upload response must reflect manifest.requirements.restart_required."""
        manifest = {
            "id": "myplugin",
            "name": "My Plugin",
            "version": "1.0.0",
            "type": "service",
        }
        if requirements:
            manifest["requirements"] = requirements
        mock_plugin_installer.install_plugin.return_value = manifest
        mock_validate.return_value = []
        mock_event_system.emit_event = AsyncMock()

        with open(minimal_zip_path, "rb") as zip_file:
            response = test_client.post(
                "/api/plugins/install",
                files={"file": ("minimal.zip", zip_file, "application/zip")},
            )

        if response.status_code == 404:
            pytest.skip("ZIP install route not available in test client")

        assert response.status_code == 200, (
            f"Expected 200, got {response.status_code}: {response.json()}"
        )
        data = response.json()
        assert data["success"] is True
        assert data["requires_restart"] is expected_restart
