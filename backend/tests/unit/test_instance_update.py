"""Unit tests for plugin instance update functionality."""

import pytest

from app.plugins.protocols import BackendPlugin
from app.services.backend_scheduler import backend_plugin_scheduler


class MockBackendPlugin(BackendPlugin):
    """Mock backend plugin for testing."""

    def __init__(self, plugin_id: str, name: str, enabled: bool = True):
        self._plugin_id = plugin_id
        self._name = name
        self._enabled = enabled
        self._running = False
        self._config = {}

    @property
    def plugin_id(self) -> str:
        return self._plugin_id

    @property
    def name(self) -> str:
        return self._name

    @property
    def enabled(self) -> bool:
        return self._enabled

    @enabled.setter
    def enabled(self, value: bool):
        self._enabled = value

    def is_running(self) -> bool:
        return self._running

    def enable(self):
        self._enabled = True

    def disable(self):
        self._enabled = False

    def start(self):
        self._running = True

    def stop(self):
        self._running = False

    async def initialize(self):
        pass

    async def configure(self, config: dict):
        self._config.update(config)

    async def cleanup(self):
        pass

    async def validate_config(self, config: dict) -> bool:
        return True

    @classmethod
    def get_plugin_metadata(cls) -> dict:
        """Get plugin metadata."""
        return {
            "id": "mock-backend",
            "name": "Mock Backend Plugin",
            "version": "1.0.0",
            "type": "backend",
        }

    async def get_schedule_config(self):
        if self._enabled:
            return {"enabled": True, "interval": 300}
        return None

    async def run_scheduled_task(self):
        return {"success": True}


@pytest.mark.unit
class TestInstanceUpdateLogic:
    """Test instance update logic and plugin manager interactions."""

    @pytest.mark.asyncio
    async def test_enable_plugin_starts_if_not_running(self):
        """Test that enabling a plugin starts it if not running."""
        from app.plugins.manager import plugin_manager

        plugin = MockBackendPlugin("test-plugin-1", "Test Plugin", enabled=False)
        await plugin_manager.register(plugin)

        try:
            assert not plugin.is_running()
            assert not plugin.enabled

            # Enable the plugin
            plugin.enable()
            if not plugin.is_running():
                await plugin.initialize()
                plugin.start()

            assert plugin.enabled is True
            assert plugin.is_running() is True
        finally:
            await plugin_manager.unregister(plugin.plugin_id)

    @pytest.mark.asyncio
    async def test_disable_plugin_stops_if_running(self):
        """Test that disabling a plugin stops it if running."""
        from app.plugins.manager import plugin_manager

        plugin = MockBackendPlugin("test-plugin-2", "Test Plugin", enabled=True)
        plugin.start()  # Start it first
        await plugin_manager.register(plugin)

        try:
            assert plugin.is_running()
            assert plugin.enabled

            # Disable the plugin
            plugin.disable()
            if plugin.is_running():
                plugin.stop()
                await plugin.cleanup()

            assert plugin.enabled is False
            assert not plugin.is_running()
        finally:
            await plugin_manager.unregister(plugin.plugin_id)

    @pytest.mark.asyncio
    async def test_backend_plugin_schedule_registration_on_enable(self):
        """Test that enabling a backend plugin registers scheduled tasks."""
        from app.plugins.manager import plugin_manager

        plugin = MockBackendPlugin("test-backend-1", "Test Backend Plugin", enabled=False)
        await plugin_manager.register(plugin)

        try:
            # Start scheduler if not running
            if not backend_plugin_scheduler.scheduler.running:
                await backend_plugin_scheduler.start()

            # Enable plugin
            plugin.enabled = True
            if not plugin.is_running():
                await plugin.initialize()
                plugin.start()

            # Register scheduled tasks
            await backend_plugin_scheduler.register_plugin_tasks(plugin)

            # Verify task was registered
            job_id = backend_plugin_scheduler._registered_tasks.get(plugin.plugin_id)
            assert job_id is not None

            # Cleanup
            await backend_plugin_scheduler.unregister_plugin_tasks(plugin.plugin_id)
        finally:
            await plugin_manager.unregister(plugin.plugin_id)

    @pytest.mark.asyncio
    async def test_backend_plugin_schedule_unregistration_on_disable(self):
        """Test that disabling a backend plugin unregisters scheduled tasks.

        Note: This test uses the real scheduler singleton. If the scheduler was
        shut down by a previous test, we recreate it to avoid event loop issues.
        """
        import app.services.backend_scheduler as scheduler_module
        from app.plugins.manager import plugin_manager

        plugin = MockBackendPlugin("test-backend-2", "Test Backend Plugin", enabled=True)
        plugin.start()
        await plugin_manager.register(plugin)

        # Get current scheduler reference
        current_scheduler = scheduler_module.backend_plugin_scheduler

        try:
            # Ensure scheduler is in a clean state
            # If scheduler was shut down by a previous test, its event loop is closed
            # and we can't restart it. Recreate the scheduler instance.
            try:
                if current_scheduler.scheduler.running:
                    current_scheduler.stop()
                # Try to start - if event loop is closed, start() will fail
                await current_scheduler.start()
            except (RuntimeError, Exception):
                # Event loop is closed - recreate scheduler instance
                # This happens when a previous test shut down the scheduler
                from app.services.backend_scheduler import BackendPluginScheduler

                # Recreate the singleton instance
                scheduler_module.backend_plugin_scheduler = BackendPluginScheduler()
                # Update the reference in this test module

                # Update the cached import in this module
                globals()["backend_plugin_scheduler"] = scheduler_module.backend_plugin_scheduler
                # Now start the fresh scheduler
                await scheduler_module.backend_plugin_scheduler.start()

            # Use the current scheduler reference (may have been recreated)
            test_scheduler = scheduler_module.backend_plugin_scheduler

            # Register scheduled tasks
            await test_scheduler.register_plugin_tasks(plugin)
            assert plugin.plugin_id in test_scheduler._registered_tasks

            # Disable plugin
            plugin.disable()
            if plugin.is_running():
                plugin.stop()
                await plugin.cleanup()

            # Unregister scheduled tasks
            await test_scheduler.unregister_plugin_tasks(plugin.plugin_id)

            # Verify task was unregistered
            assert plugin.plugin_id not in test_scheduler._registered_tasks

            # Stop scheduler to clean up
            if test_scheduler.scheduler.running:
                test_scheduler.stop()
        finally:
            # Clean up any remaining tasks
            test_scheduler = scheduler_module.backend_plugin_scheduler
            if plugin.plugin_id in test_scheduler._registered_tasks:
                try:
                    await test_scheduler.unregister_plugin_tasks(plugin.plugin_id)
                except Exception:
                    pass  # Ignore cleanup errors
            await plugin_manager.unregister(plugin.plugin_id)
