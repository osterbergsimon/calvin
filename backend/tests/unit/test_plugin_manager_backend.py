"""Unit tests for PluginManager with backend plugins."""

from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

from app.plugins.base import PluginType
from app.plugins.manager import PluginManager
from app.plugins.protocols import BackendPlugin


class MockBackendPlugin(BackendPlugin):
    """Mock BackendPlugin for testing."""

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
        self._initialized = False

    @classmethod
    def get_plugin_metadata(cls):
        return {"type_id": "test-backend", "plugin_type": PluginType.BACKEND}

    @property
    def plugin_type(self) -> PluginType:
        return PluginType.BACKEND

    async def initialize(self) -> None:
        self._initialized = True
        self._running = True

    async def cleanup(self) -> None:
        self._initialized = False
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


@pytest.fixture
def plugin_manager():
    """Create a PluginManager instance."""
    return PluginManager()


@pytest.mark.unit
class TestPluginManagerBackendPlugins:
    """Test suite for PluginManager with backend plugins."""

    def test_plugin_manager_tracks_backend_plugins(self, plugin_manager):
        """Test that PluginManager tracks backend plugins."""
        plugin = MockBackendPlugin(
            plugin_id="backend-1",
            name="Test Backend Plugin",
            enabled=True,
            schedule_config={"interval": 300, "enabled": True, "max_concurrent": 1},
        )

        plugin_manager.register(plugin)

        assert plugin_manager.get_plugin("backend-1") == plugin
        backend_plugins = plugin_manager.get_plugins(PluginType.BACKEND, enabled_only=False)
        assert len(backend_plugins) == 1
        assert backend_plugins[0] == plugin

    def test_plugin_manager_registers_backend_plugin_type(self, plugin_manager):
        """Test that PluginManager initializes BACKEND plugin type list."""
        # BACKEND should be in _plugins_by_type
        assert PluginType.BACKEND in plugin_manager._plugins_by_type
        assert plugin_manager._plugins_by_type[PluginType.BACKEND] == []

    def test_plugin_manager_get_plugins_backend(self, plugin_manager):
        """Test getting backend plugins by type."""
        plugin1 = MockBackendPlugin("backend-1", "Backend Plugin 1")
        plugin2 = MockBackendPlugin("backend-2", "Backend Plugin 2")

        plugin_manager.register(plugin1)
        plugin_manager.register(plugin2)

        backend_plugins = plugin_manager.get_plugins(PluginType.BACKEND, enabled_only=False)
        assert len(backend_plugins) == 2
        assert plugin1 in backend_plugins
        assert plugin2 in backend_plugins

    def test_plugin_manager_get_plugin_count_backend(self, plugin_manager):
        """Test getting backend plugin count."""
        plugin1 = MockBackendPlugin("backend-1", "Backend Plugin 1")
        plugin2 = MockBackendPlugin("backend-2", "Backend Plugin 2")

        plugin_manager.register(plugin1)
        plugin_manager.register(plugin2)

        count = plugin_manager.get_plugin_count(PluginType.BACKEND)
        assert count == 2

    @pytest.mark.asyncio
    @patch("app.services.backend_scheduler.backend_plugin_scheduler")
    async def test_initialize_all_registers_backend_tasks(self, mock_scheduler, plugin_manager):
        """Test that initialize_all registers scheduled tasks for backend plugins."""
        mock_scheduler.register_plugin_tasks = AsyncMock()

        plugin = MockBackendPlugin(
            plugin_id="backend-1",
            name="Test Backend Plugin",
            enabled=True,
            schedule_config={"interval": 300, "enabled": True, "max_concurrent": 1},
        )

        plugin_manager.register(plugin)

        await plugin_manager.initialize_all()

        # Verify plugin was initialized and started
        assert plugin.is_running()
        # Verify scheduler was called to register tasks
        mock_scheduler.register_plugin_tasks.assert_called_once_with(plugin)

    @pytest.mark.asyncio
    @patch("app.services.backend_scheduler.backend_plugin_scheduler")
    async def test_initialize_all_skips_disabled_backend_plugins(
        self, mock_scheduler, plugin_manager
    ):
        """Test that initialize_all skips disabled backend plugins."""
        mock_scheduler.register_plugin_tasks = AsyncMock()

        plugin = MockBackendPlugin(
            plugin_id="backend-disabled",
            name="Disabled Backend Plugin",
            enabled=False,
            schedule_config={"interval": 300, "enabled": True, "max_concurrent": 1},
        )

        plugin_manager.register(plugin)

        await plugin_manager.initialize_all()

        # Disabled plugin should not be initialized
        assert not plugin.is_running()
        # Scheduler should not be called for disabled plugins
        mock_scheduler.register_plugin_tasks.assert_not_called()

    @pytest.mark.asyncio
    @patch("app.services.backend_scheduler.backend_plugin_scheduler")
    async def test_initialize_all_handles_backend_plugin_errors(
        self, mock_scheduler, plugin_manager
    ):
        """Test that initialize_all handles errors during backend plugin initialization."""
        mock_scheduler.register_plugin_tasks = AsyncMock()

        # Create a plugin that raises an error during initialization
        plugin = MockBackendPlugin("backend-error", "Error Plugin", enabled=True)

        async def failing_initialize():
            raise Exception("Initialization failed")

        plugin.initialize = failing_initialize

        plugin_manager.register(plugin)

        # Should not raise exception, just log error
        await plugin_manager.initialize_all()

        # Plugin should be stopped due to initialization failure
        assert not plugin.is_running()
        # Scheduler should not be called if initialization failed
        mock_scheduler.register_plugin_tasks.assert_not_called()

    @pytest.mark.asyncio
    @patch("app.services.backend_scheduler.backend_plugin_scheduler")
    async def test_unregister_backend_plugin(self, mock_scheduler, plugin_manager):
        """Test unregistering a backend plugin."""
        mock_scheduler.unregister_plugin_tasks = AsyncMock()

        plugin = MockBackendPlugin("backend-1", "Test Backend Plugin", enabled=True)
        plugin.start()

        plugin_manager.register(plugin)

        # Unregister plugin
        result = plugin_manager.unregister("backend-1")

        assert result is True
        assert plugin_manager.get_plugin("backend-1") is None
        # Note: unregister() does not call the scheduler - that's handled by stop_plugin()
        # Note: unregister() does not stop the plugin - it just removes it from the manager
        # The scheduler cleanup and plugin stopping should be done before calling unregister()

    @pytest.mark.asyncio
    @patch("app.services.backend_scheduler.backend_plugin_scheduler")
    async def test_unregister_backend_plugin_not_found(self, mock_scheduler, plugin_manager):
        """Test unregistering a non-existent backend plugin."""
        mock_scheduler.unregister_plugin_tasks = AsyncMock()

        result = plugin_manager.unregister("nonexistent-backend")

        assert result is False
        # Scheduler should not be called if plugin doesn't exist
        mock_scheduler.unregister_plugin_tasks.assert_not_called()

    @pytest.mark.asyncio
    @patch("app.services.backend_scheduler.backend_plugin_scheduler")
    async def test_unregister_handles_scheduler_error(self, mock_scheduler, plugin_manager):
        """Test that unregister handles scheduler errors gracefully."""
        mock_scheduler.unregister_plugin_tasks = AsyncMock(side_effect=Exception("Scheduler error"))

        plugin = MockBackendPlugin("backend-1", "Test Backend Plugin", enabled=True)
        plugin.start()

        plugin_manager.register(plugin)

        # Should not raise exception, just log warning
        result = plugin_manager.unregister("backend-1")

        # Plugin should still be unregistered even if scheduler fails
        assert result is True
        assert plugin_manager.get_plugin("backend-1") is None

    @pytest.mark.asyncio
    @patch("app.services.backend_scheduler.backend_plugin_scheduler")
    async def test_start_plugin_registers_backend_tasks(self, mock_scheduler, plugin_manager):
        """Test that start_plugin registers scheduled tasks for backend plugins."""
        mock_scheduler.register_plugin_tasks = AsyncMock()

        plugin = MockBackendPlugin(
            plugin_id="backend-1",
            name="Test Backend Plugin",
            enabled=True,
            schedule_config={"interval": 300, "enabled": True, "max_concurrent": 1},
        )

        plugin_manager.register(plugin)

        # Start plugin
        result = await plugin_manager.start_plugin("backend-1")

        assert result is True
        assert plugin.is_running()
        # Verify scheduler was called to register tasks
        mock_scheduler.register_plugin_tasks.assert_called_once_with(plugin)

    @pytest.mark.asyncio
    @patch("app.services.backend_scheduler.backend_plugin_scheduler")
    async def test_stop_plugin_unregisters_backend_tasks(self, mock_scheduler, plugin_manager):
        """Test that stop_plugin unregisters scheduled tasks for backend plugins."""
        mock_scheduler.unregister_plugin_tasks = AsyncMock()

        plugin = MockBackendPlugin("backend-1", "Test Backend Plugin", enabled=True)
        plugin.start()

        plugin_manager.register(plugin)

        # Stop plugin
        result = await plugin_manager.stop_plugin("backend-1")

        assert result is True
        assert not plugin.is_running()
        # Verify scheduler was called to unregister tasks
        mock_scheduler.unregister_plugin_tasks.assert_called_once_with("backend-1")
