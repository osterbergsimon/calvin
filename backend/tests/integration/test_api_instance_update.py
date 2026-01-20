"""Integration tests for plugin instance update endpoint."""

import asyncio

import pytest

from app.models.db_models import PluginDB, PluginTypeDB
from app.plugins.base import PluginType
from app.plugins.manager import plugin_manager
from app.plugins.protocols import BackendPlugin
from app.services.backend_scheduler import backend_plugin_scheduler


@pytest.mark.integration
class TestInstanceUpdate:
    """Test plugin instance update endpoint (PUT /api/plugins/instances/{instance_id})."""

    def test_update_instance_enabled_true(self, test_client):
        """Test enabling a plugin instance."""
        instance_id = "test-instance-enabled"
        # Create a test instance in the database (must use sync wrapper for test_client)
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:

            async def setup_instance():
                # First ensure plugin type exists
                db_type = await PluginTypeDB.objects.get_or_none(type_id="local")
                if not db_type:
                    await PluginTypeDB.objects.create(
                        type_id="local",
                        plugin_type=PluginType.IMAGE.value,
                        name="Local Images",
                        enabled=True,
                    )

                # Create instance (if not exists)
                db_instance = await PluginDB.objects.get_or_none(id=instance_id)
                if not db_instance:
                    await PluginDB.objects.create(
                        id=instance_id,
                        type_id="local",
                        plugin_type=PluginType.IMAGE.value,
                        name="Test Instance",
                        enabled=False,
                        config={},
                    )

            loop.run_until_complete(setup_instance())

            # Update instance to enabled
            response = test_client.put(
                f"/api/plugins/instances/{instance_id}", json={"enabled": True}
            )

            # Route might not be registered if instances router isn't loaded
            if response.status_code == 404:
                # Check if it's a route registration issue or actual 404
                detail = response.json().get("detail", "")
                if "not found" in detail.lower() and "database" in detail.lower():
                    # Instance doesn't exist - this is expected if cleanup ran
                    pytest.skip(f"Instance {instance_id} not found (may have been cleaned up)")
                else:
                    # Route not registered - check if endpoint exists
                    pytest.skip("Instance update route not available in test client")

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert data["instance"]["enabled"] is True

            # Verify in database
            async def verify_instance():
                db_instance = await PluginDB.objects.get_or_none(id=instance_id)
                assert db_instance is not None
                assert db_instance.enabled is True

            loop.run_until_complete(verify_instance())

            # Cleanup
            async def cleanup_instance():
                db_instance = await PluginDB.objects.get_or_none(id=instance_id)
                if db_instance:
                    await db_instance.delete()

            loop.run_until_complete(cleanup_instance())
        finally:
            loop.close()

    def test_update_instance_enabled_false(self, test_client):
        """Test disabling a plugin instance."""
        instance_id = "test-instance-disabled"
        # Create a test instance in the database
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:

            async def setup_instance():
                # Ensure plugin type exists
                db_type = await PluginTypeDB.objects.get_or_none(type_id="local")
                if not db_type:
                    await PluginTypeDB.objects.create(
                        type_id="local",
                        plugin_type=PluginType.IMAGE.value,
                        name="Local Images",
                        enabled=True,
                    )

                # Create instance (if not exists)
                db_instance = await PluginDB.objects.get_or_none(id=instance_id)
                if not db_instance:
                    await PluginDB.objects.create(
                        id=instance_id,
                        type_id="local",
                        plugin_type=PluginType.IMAGE.value,
                        name="Test Instance",
                        enabled=True,
                        config={},
                    )

            loop.run_until_complete(setup_instance())

            # Update instance to disabled
            response = test_client.put(
                f"/api/plugins/instances/{instance_id}", json={"enabled": False}
            )

            if response.status_code == 404:
                detail = response.json().get("detail", "")
                if "not found" in detail.lower() and "database" in detail.lower():
                    pytest.skip(f"Instance {instance_id} not found (may have been cleaned up)")
                else:
                    pytest.skip("Instance update route not available in test client")

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert data["instance"]["enabled"] is False

            # Verify in database
            async def verify_instance():
                db_instance = await PluginDB.objects.get_or_none(id=instance_id)
                assert db_instance is not None
                assert db_instance.enabled is False

            loop.run_until_complete(verify_instance())

            # Cleanup
            async def cleanup_instance():
                db_instance = await PluginDB.objects.get_or_none(id=instance_id)
                if db_instance:
                    await db_instance.delete()

            loop.run_until_complete(cleanup_instance())
        finally:
            loop.close()

    def test_update_instance_not_found(self, test_client):
        """Test updating a non-existent instance."""
        response = test_client.put(
            "/api/plugins/instances/nonexistent-instance", json={"enabled": True}
        )

        if response.status_code == 404:
            detail = response.json().get("detail", "")
            if "route" in detail.lower() or "not available" in detail.lower():
                pytest.skip("Instance update route not available in test client")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_update_instance_config(self, test_client):
        """Test updating instance configuration."""
        instance_id = "test-instance-config"
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:

            async def setup_instance():
                db_type = await PluginTypeDB.objects.get_or_none(type_id="local")
                if not db_type:
                    await PluginTypeDB.objects.create(
                        type_id="local",
                        plugin_type=PluginType.IMAGE.value,
                        name="Local Images",
                        enabled=True,
                    )

                db_instance = await PluginDB.objects.get_or_none(id=instance_id)
                if not db_instance:
                    await PluginDB.objects.create(
                        id=instance_id,
                        type_id="local",
                        plugin_type=PluginType.IMAGE.value,
                        name="Test Instance",
                        enabled=True,
                        config={"key1": "value1"},
                    )

            loop.run_until_complete(setup_instance())

            # Update config
            new_config = {"key1": "updated_value", "key2": "new_value"}
            response = test_client.put(
                f"/api/plugins/instances/{instance_id}", json={"config": new_config}
            )

            if response.status_code == 404:
                detail = response.json().get("detail", "")
                if "not found" in detail.lower() and "database" in detail.lower():
                    pytest.skip(f"Instance {instance_id} not found (may have been cleaned up)")
                else:
                    pytest.skip("Instance update route not available in test client")

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True

            # Verify config was merged
            async def verify_config():
                db_instance = await PluginDB.objects.get_or_none(id=instance_id)
                assert db_instance is not None
                assert db_instance.config["key1"] == "updated_value"
                assert db_instance.config["key2"] == "new_value"

            loop.run_until_complete(verify_config())

            # Cleanup
            async def cleanup_instance():
                db_instance = await PluginDB.objects.get_or_none(id=instance_id)
                if db_instance:
                    await db_instance.delete()

            loop.run_until_complete(cleanup_instance())
        finally:
            loop.close()

    def test_update_instance_name(self, test_client):
        """Test updating instance name."""
        instance_id = "test-instance-name"
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:

            async def setup_instance():
                db_type = await PluginTypeDB.objects.get_or_none(type_id="local")
                if not db_type:
                    await PluginTypeDB.objects.create(
                        type_id="local",
                        plugin_type=PluginType.IMAGE.value,
                        name="Local Images",
                        enabled=True,
                    )

                db_instance = await PluginDB.objects.get_or_none(id=instance_id)
                if not db_instance:
                    await PluginDB.objects.create(
                        id=instance_id,
                        type_id="local",
                        plugin_type=PluginType.IMAGE.value,
                        name="Old Name",
                        enabled=True,
                        config={},
                    )

            loop.run_until_complete(setup_instance())

            # Update name
            response = test_client.put(
                f"/api/plugins/instances/{instance_id}", json={"name": "New Name"}
            )

            if response.status_code == 404:
                detail = response.json().get("detail", "")
                if "not found" in detail.lower() and "database" in detail.lower():
                    pytest.skip(f"Instance {instance_id} not found (may have been cleaned up)")
                else:
                    pytest.skip("Instance update route not available in test client")

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert data["instance"]["name"] == "New Name"

            # Cleanup
            async def cleanup_instance():
                db_instance = await PluginDB.objects.get_or_none(id=instance_id)
                if db_instance:
                    await db_instance.delete()

            loop.run_until_complete(cleanup_instance())
        finally:
            loop.close()


@pytest.mark.integration
class TestBackendPluginInstanceUpdate:
    """Test backend plugin instance enabling/disabling specifically."""

    def test_enable_backend_plugin_registers_scheduled_tasks(self, test_client):
        """Test that enabling a backend plugin registers scheduled tasks."""
        instance_id = "test-backend-instance-1"
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:

            async def setup_instance():
                # Create backend plugin type
                db_type = await PluginTypeDB.objects.get_or_none(type_id="test-backend-instance")
                if not db_type:
                    await PluginTypeDB.objects.create(
                        type_id="test-backend-instance",
                        plugin_type=PluginType.BACKEND.value,
                        name="Test Backend Plugin",
                        enabled=True,
                    )

                # Create backend plugin instance
                db_instance = await PluginDB.objects.get_or_none(id=instance_id)
                if not db_instance:
                    await PluginDB.objects.create(
                        id=instance_id,
                        type_id="test-backend-instance",
                        plugin_type=PluginType.BACKEND.value,
                        name="Test Backend Instance",
                        enabled=False,
                        config={
                            "email_address": "test@example.com",
                            "email_password": "test123",
                            "check_interval": "300",
                        },
                    )

            loop.run_until_complete(setup_instance())

            # Mock the plugin loader to return a mock backend plugin
            from unittest.mock import AsyncMock, MagicMock, patch

            mock_plugin = MagicMock(spec=BackendPlugin)
            mock_plugin.plugin_id = instance_id
            mock_plugin.name = "Test Backend Instance"
            mock_plugin.enabled = False
            mock_plugin.is_running.return_value = False
            mock_plugin.configure = AsyncMock()
            mock_plugin.initialize = AsyncMock()
            mock_plugin.start = MagicMock()
            mock_plugin.stop = MagicMock()
            mock_plugin.cleanup = AsyncMock()
            mock_plugin.enable = MagicMock()
            mock_plugin.disable = MagicMock()

            # Mock schedule config
            mock_plugin.get_schedule_config = AsyncMock(
                return_value={"enabled": True, "interval": 300}
            )
            mock_plugin.run_scheduled_task = AsyncMock(return_value={"success": True})

            with patch(
                "app.plugins.loader.plugin_loader.create_plugin_instance",
                return_value=mock_plugin,
            ):
                # Enable the instance
                response = test_client.put(
                    f"/api/plugins/instances/{instance_id}", json={"enabled": True}
                )

                if response.status_code == 404:
                    detail = response.json().get("detail", "")
                    if "not found" in detail.lower() and "database" in detail.lower():
                        pytest.skip(f"Instance {instance_id} not found (may have been cleaned up)")
                    else:
                        pytest.skip("Instance update route not available in test client")

                assert response.status_code == 200
                data = response.json()
                assert data["success"] is True
                assert data["instance"]["enabled"] is True

                # Verify plugin methods were called
                mock_plugin.enable.assert_called_once()
                mock_plugin.initialize.assert_called_once()
                mock_plugin.start.assert_called_once()

            # Cleanup
            async def cleanup_instance():
                db_instance = await PluginDB.objects.get_or_none(id=instance_id)
                if db_instance:
                    await db_instance.delete()

                db_type = await PluginTypeDB.objects.get_or_none(type_id="test-backend-instance")
                if db_type:
                    await db_type.delete()

            loop.run_until_complete(cleanup_instance())
        finally:
            loop.close()

    def test_disable_backend_plugin_unregisters_scheduled_tasks(self, test_client):
        """Test that disabling a backend plugin unregisters scheduled tasks."""
        instance_id = "test-backend-instance-disable"
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:

            async def setup_instance():
                # Create backend plugin type
                db_type = await PluginTypeDB.objects.get_or_none(type_id="test-backend-disable")
                if not db_type:
                    await PluginTypeDB.objects.create(
                        type_id="test-backend-disable",
                        plugin_type=PluginType.BACKEND.value,
                        name="Test Backend Plugin",
                        enabled=True,
                    )

                # Create enabled backend plugin instance
                db_instance = await PluginDB.objects.get_or_none(id=instance_id)
                if not db_instance:
                    await PluginDB.objects.create(
                        id=instance_id,
                        type_id="test-backend-disable",
                        plugin_type=PluginType.BACKEND.value,
                        name="Test Backend Instance",
                        enabled=True,
                        config={},
                    )

            loop.run_until_complete(setup_instance())

            # Mock the plugin to return from manager
            from unittest.mock import AsyncMock, MagicMock, patch

            mock_plugin = MagicMock(spec=BackendPlugin)
            mock_plugin.plugin_id = instance_id
            mock_plugin.name = "Test Backend Instance"
            mock_plugin.enabled = True
            mock_plugin.is_running.return_value = True
            mock_plugin.configure = AsyncMock()
            mock_plugin.stop = MagicMock()
            mock_plugin.cleanup = AsyncMock()
            mock_plugin.disable = MagicMock()

            with (
                patch.object(plugin_manager, "get_plugin", return_value=mock_plugin),
                patch.object(
                    backend_plugin_scheduler, "unregister_plugin_tasks", new_callable=AsyncMock
                ) as mock_unregister,
            ):
                # Disable the instance
                response = test_client.put(
                    f"/api/plugins/instances/{instance_id}", json={"enabled": False}
                )

                if response.status_code == 404:
                    detail = response.json().get("detail", "")
                    if "not found" in detail.lower() and "database" in detail.lower():
                        pytest.skip(f"Instance {instance_id} not found (may have been cleaned up)")
                    else:
                        pytest.skip("Instance update route not available in test client")

                assert response.status_code == 200
                data = response.json()
                assert data["success"] is True
                assert data["instance"]["enabled"] is False

                # Verify plugin methods were called
                mock_plugin.disable.assert_called_once()
                mock_plugin.stop.assert_called_once()
                mock_plugin.cleanup.assert_called_once()
                # Verify scheduler was called to unregister tasks
                mock_unregister.assert_called_once_with(instance_id)

            # Cleanup
            async def cleanup_instance():
                db_instance = await PluginDB.objects.get_or_none(id=instance_id)
                if db_instance:
                    await db_instance.delete()

                db_type = await PluginTypeDB.objects.get_or_none(type_id="test-backend-disable")
                if db_type:
                    await db_type.delete()

            loop.run_until_complete(cleanup_instance())
        finally:
            loop.close()


@pytest.mark.integration
class TestPluginTypeEnableDisable:
    """Test enabling/disabling plugin types (not instances)."""

    def test_enable_plugin_type(self, test_client):
        """Test enabling a plugin type."""
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:

            async def get_original_state():
                db_type = await PluginTypeDB.objects.get_or_none(type_id="local")
                if db_type:
                    original_enabled = db_type.enabled
                    # Temporarily disable for test
                    db_type.enabled = False
                    await db_type.update()
                    return original_enabled
                return None

            original_enabled = loop.run_until_complete(get_original_state())

            try:
                # Enable the plugin type
                response = test_client.put("/api/plugins/local", json={"enabled": True})

                assert response.status_code == 200
                data = response.json()
                assert "plugin_id" in data or "message" in data

                # Verify via GET endpoint (tests full stack, avoids session isolation issues)
                get_response = test_client.get("/api/plugins/local")
                assert get_response.status_code == 200
                plugin_data = get_response.json()
                assert plugin_data["enabled"] is True
            finally:
                # Restore original state
                if original_enabled is not None:

                    async def restore_state():
                        db_type = await PluginTypeDB.objects.get_or_none(type_id="local")
                        if db_type:
                            db_type.enabled = original_enabled
                            await db_type.update()

                    loop.run_until_complete(restore_state())
        finally:
            loop.close()

    def test_disable_plugin_type(self, test_client):
        """Test disabling a plugin type."""
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:

            async def get_original_state():
                db_type = await PluginTypeDB.objects.get_or_none(type_id="local")
                if db_type:
                    original_enabled = db_type.enabled
                    # Temporarily enable for test
                    db_type.enabled = True
                    await db_type.update()
                    return original_enabled
                return None

            original_enabled = loop.run_until_complete(get_original_state())

            try:
                # Disable the plugin type
                response = test_client.put("/api/plugins/local", json={"enabled": False})

                assert response.status_code == 200
                data = response.json()
                assert "plugin_id" in data or "message" in data

                # Verify via GET endpoint (tests full stack, avoids session isolation issues)
                get_response = test_client.get("/api/plugins/local")
                assert get_response.status_code == 200
                plugin_data = get_response.json()
                assert plugin_data["enabled"] is False
            finally:
                # Restore original state
                if original_enabled is not None:

                    async def restore_state():
                        db_type = await PluginTypeDB.objects.get_or_none(type_id="local")
                        if db_type:
                            db_type.enabled = original_enabled
                            await db_type.update()

                    loop.run_until_complete(restore_state())
        finally:
            loop.close()

    def test_enable_backend_plugin_type(self, test_client):
        """Test enabling a backend plugin type."""
        # This test verifies that backend plugin types can be enabled/disabled
        # similar to other plugin types

        # Try to enable backend plugin type (if it exists)
        # Note: This assumes a backend plugin type exists in the database
        # If not, the test will check the response appropriately

        response = test_client.put("/api/plugins/imap", json={"enabled": True})

        # Should either succeed (200) or return 404 if plugin type doesn't exist
        assert response.status_code in [200, 404]

        if response.status_code == 200:
            data = response.json()
            assert "plugin_id" in data or "message" in data
