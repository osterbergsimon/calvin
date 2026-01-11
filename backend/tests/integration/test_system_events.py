"""Integration tests for system events."""

import asyncio
from typing import Any

import pytest

from app.plugins.base import PluginType
from app.plugins.manager import plugin_manager
from app.plugins.protocols import BackendPlugin
from app.services.event_system import event_system


class MockSystemEventBackendPlugin(BackendPlugin):
    """Mock BackendPlugin that subscribes to system events for testing."""

    def __init__(
        self,
        plugin_id: str,
        name: str,
        enabled: bool = True,
        subscribed_events: list[str] | None = None,
    ):
        super().__init__(plugin_id, name, enabled)
        self._subscribed_events = subscribed_events or []
        self._received_events = []

    @classmethod
    def get_plugin_metadata(cls):
        return {"type_id": "test_system_event", "plugin_type": PluginType.BACKEND}

    @property
    def plugin_type(self) -> PluginType:
        return PluginType.BACKEND

    async def initialize(self) -> None:
        pass

    async def cleanup(self) -> None:
        pass

    async def validate_config(self, config: dict[str, Any]) -> bool:
        return True

    async def get_subscribed_events(self) -> list[str]:
        return self._subscribed_events

    async def handle_event(
        self, event_type: str, event_data: dict[str, Any]
    ) -> dict[str, Any] | None:
        self._received_events.append((event_type, event_data))
        return {"handled": True, "plugin_id": self.plugin_id}

    def get_received_events(self) -> list[tuple[str, dict[str, Any]]]:
        """Get list of received events for testing."""
        return self._received_events.copy()

    def clear_received_events(self) -> None:
        """Clear received events list."""


@pytest.mark.asyncio
async def test_plugin_enabled_event():
    """Test that plugin_enabled event is emitted when a plugin is enabled."""
    # Create plugin that subscribes to plugin_enabled events
    plugin = MockSystemEventBackendPlugin(
        "test-plugin-enabled",
        "Test Plugin Enabled",
        enabled=True,
        subscribed_events=["plugin_enabled"],
    )

    # Register plugin
    await plugin_manager.register(plugin)

    # Emit plugin_enabled event (simulating plugin being enabled)
    await event_system.emit_event(
        "plugin_enabled",
        {
            "plugin_id": "test-plugin",
            "plugin_type": "backend",
            "enabled_at": "2024-01-01T00:00:00Z",
        },
        wait_for_handlers=False,
    )

    # Wait for handler to complete
    await asyncio.sleep(0.1)

    # Check that plugin received the event
    received = plugin.get_received_events()
    assert len(received) == 1
    assert received[0][0] == "plugin_enabled"
    assert received[0][1]["plugin_id"] == "test-plugin"
    assert received[0][1]["plugin_type"] == "backend"
    assert "enabled_at" in received[0][1]

    # Cleanup
    await plugin_manager.unregister("test-plugin-enabled")


@pytest.mark.asyncio
async def test_plugin_disabled_event():
    """Test that plugin_disabled event is emitted when a plugin is disabled."""
    # Create plugin that subscribes to plugin_disabled events
    plugin = MockSystemEventBackendPlugin(
        "test-plugin-disabled",
        "Test Plugin Disabled",
        enabled=True,
        subscribed_events=["plugin_disabled"],
    )

    # Register plugin
    await plugin_manager.register(plugin)

    # Emit plugin_disabled event
    await event_system.emit_event(
        "plugin_disabled",
        {
            "plugin_id": "test-plugin",
            "plugin_type": "backend",
            "disabled_at": "2024-01-01T00:00:00Z",
        },
        wait_for_handlers=False,
    )

    # Wait for handler to complete
    await asyncio.sleep(0.1)

    # Check that plugin received the event
    received = plugin.get_received_events()
    assert len(received) == 1
    assert received[0][0] == "plugin_disabled"
    assert received[0][1]["plugin_id"] == "test-plugin"
    assert "disabled_at" in received[0][1]

    # Cleanup
    await plugin_manager.unregister("test-plugin-disabled")


@pytest.mark.asyncio
async def test_plugin_installed_event():
    """Test that plugin_installed event is emitted when a plugin is installed."""
    # Create plugin that subscribes to plugin_installed events
    plugin = MockSystemEventBackendPlugin(
        "test-plugin-installed",
        "Test Plugin Installed",
        enabled=True,
        subscribed_events=["plugin_installed"],
    )

    # Register plugin
    await plugin_manager.register(plugin)

    # Emit plugin_installed event
    await event_system.emit_event(
        "plugin_installed",
        {
            "plugin_id": "new-plugin",
            "plugin_type": "backend",
            "version": "1.0.0",
            "installed_at": "2024-01-01T00:00:00Z",
        },
        wait_for_handlers=False,
    )

    # Wait for handler to complete
    await asyncio.sleep(0.1)

    # Check that plugin received the event
    received = plugin.get_received_events()
    assert len(received) == 1
    assert received[0][0] == "plugin_installed"
    assert received[0][1]["plugin_id"] == "new-plugin"
    assert received[0][1]["version"] == "1.0.0"
    assert "installed_at" in received[0][1]

    # Cleanup
    await plugin_manager.unregister("test-plugin-installed")


@pytest.mark.asyncio
async def test_plugin_uninstalled_event():
    """Test that plugin_uninstalled event is emitted when a plugin is uninstalled."""
    # Create plugin that subscribes to plugin_uninstalled events
    plugin = MockSystemEventBackendPlugin(
        "test-plugin-uninstalled",
        "Test Plugin Uninstalled",
        enabled=True,
        subscribed_events=["plugin_uninstalled"],
    )

    # Register plugin
    await plugin_manager.register(plugin)

    # Emit plugin_uninstalled event
    await event_system.emit_event(
        "plugin_uninstalled",
        {
            "plugin_id": "old-plugin",
            "plugin_type": "backend",
            "uninstalled_at": "2024-01-01T00:00:00Z",
        },
        wait_for_handlers=False,
    )

    # Wait for handler to complete
    await asyncio.sleep(0.1)

    # Check that plugin received the event
    received = plugin.get_received_events()
    assert len(received) == 1
    assert received[0][0] == "plugin_uninstalled"
    assert received[0][1]["plugin_id"] == "old-plugin"
    assert "uninstalled_at" in received[0][1]

    # Cleanup
    await plugin_manager.unregister("test-plugin-uninstalled")


@pytest.mark.asyncio
async def test_plugin_instance_created_event():
    """Test that plugin_instance_created event is emitted when an instance is created."""
    # Create plugin that subscribes to plugin_instance_created events
    plugin = MockSystemEventBackendPlugin(
        "test-instance-created",
        "Test Instance Created",
        enabled=True,
        subscribed_events=["plugin_instance_created"],
    )

    # Register plugin
    await plugin_manager.register(plugin)

    # Emit plugin_instance_created event
    await event_system.emit_event(
        "plugin_instance_created",
        {
            "instance_id": "instance-123",
            "plugin_id": "test-plugin",
            "name": "Test Instance",
            "created_at": "2024-01-01T00:00:00Z",
        },
        wait_for_handlers=False,
    )

    # Wait for handler to complete
    await asyncio.sleep(0.1)

    # Check that plugin received the event
    received = plugin.get_received_events()
    assert len(received) == 1
    assert received[0][0] == "plugin_instance_created"
    assert received[0][1]["instance_id"] == "instance-123"
    assert received[0][1]["plugin_id"] == "test-plugin"
    assert received[0][1]["name"] == "Test Instance"
    assert "created_at" in received[0][1]

    # Cleanup
    await plugin_manager.unregister("test-instance-created")


@pytest.mark.asyncio
async def test_plugin_instance_updated_event():
    """Test that plugin_instance_updated event is emitted when an instance is updated."""
    # Create plugin that subscribes to plugin_instance_updated events
    plugin = MockSystemEventBackendPlugin(
        "test-instance-updated",
        "Test Instance Updated",
        enabled=True,
        subscribed_events=["plugin_instance_updated"],
    )

    # Register plugin
    await plugin_manager.register(plugin)

    # Emit plugin_instance_updated event
    await event_system.emit_event(
        "plugin_instance_updated",
        {
            "instance_id": "instance-123",
            "plugin_id": "test-plugin",
            "changes": {"enabled": True, "config": {"key": "value"}},
            "updated_at": "2024-01-01T00:00:00Z",
        },
        wait_for_handlers=False,
    )

    # Wait for handler to complete
    await asyncio.sleep(0.1)

    # Check that plugin received the event
    received = plugin.get_received_events()
    assert len(received) == 1
    assert received[0][0] == "plugin_instance_updated"
    assert received[0][1]["instance_id"] == "instance-123"
    assert "changes" in received[0][1]
    assert received[0][1]["changes"]["enabled"] is True
    assert "updated_at" in received[0][1]

    # Cleanup
    await plugin_manager.unregister("test-instance-updated")


@pytest.mark.asyncio
async def test_plugin_instance_started_event():
    """Test that plugin_instance_started event is emitted when an instance starts."""
    # Create plugin that subscribes to plugin_instance_started events
    plugin = MockSystemEventBackendPlugin(
        "test-instance-started",
        "Test Instance Started",
        enabled=True,
        subscribed_events=["plugin_instance_started"],
    )

    # Register plugin
    await plugin_manager.register(plugin)

    # Emit plugin_instance_started event
    await event_system.emit_event(
        "plugin_instance_started",
        {
            "instance_id": "instance-123",
            "plugin_id": "test-plugin",
            "started_at": "2024-01-01T00:00:00Z",
        },
        wait_for_handlers=False,
    )

    # Wait for handler to complete
    await asyncio.sleep(0.1)

    # Check that plugin received the event
    received = plugin.get_received_events()
    assert len(received) == 1
    assert received[0][0] == "plugin_instance_started"
    assert received[0][1]["instance_id"] == "instance-123"
    assert received[0][1]["plugin_id"] == "test-plugin"
    assert "started_at" in received[0][1]

    # Cleanup
    await plugin_manager.unregister("test-instance-started")


@pytest.mark.asyncio
async def test_plugin_instance_stopped_event():
    """Test that plugin_instance_stopped event is emitted when an instance stops."""
    # Create plugin that subscribes to plugin_instance_stopped events
    plugin = MockSystemEventBackendPlugin(
        "test-instance-stopped",
        "Test Instance Stopped",
        enabled=True,
        subscribed_events=["plugin_instance_stopped"],
    )

    # Register plugin
    await plugin_manager.register(plugin)

    # Emit plugin_instance_stopped event
    await event_system.emit_event(
        "plugin_instance_stopped",
        {
            "instance_id": "instance-123",
            "plugin_id": "test-plugin",
            "stopped_at": "2024-01-01T00:00:00Z",
        },
        wait_for_handlers=False,
    )

    # Wait for handler to complete
    await asyncio.sleep(0.1)

    # Check that plugin received the event
    received = plugin.get_received_events()
    assert len(received) == 1
    assert received[0][0] == "plugin_instance_stopped"
    assert received[0][1]["instance_id"] == "instance-123"
    assert received[0][1]["plugin_id"] == "test-plugin"
    assert "stopped_at" in received[0][1]

    # Cleanup
    await plugin_manager.unregister("test-instance-stopped")


@pytest.mark.asyncio
async def test_multiple_plugins_subscribe_to_system_events():
    """Test that multiple plugins can subscribe to the same system event."""
    # Create two plugins subscribing to same event
    plugin1 = MockSystemEventBackendPlugin(
        "test-plugin-1",
        "Test Plugin 1",
        enabled=True,
        subscribed_events=["plugin_enabled"],
    )
    plugin2 = MockSystemEventBackendPlugin(
        "test-plugin-2",
        "Test Plugin 2",
        enabled=True,
        subscribed_events=["plugin_enabled"],
    )

    # Register both plugins
    await plugin_manager.register(plugin1)
    await plugin_manager.register(plugin2)

    # Emit plugin_enabled event
    await event_system.emit_event(
        "plugin_enabled",
        {
            "plugin_id": "test-plugin",
            "plugin_type": "backend",
            "enabled_at": "2024-01-01T00:00:00Z",
        },
        wait_for_handlers=False,
    )
    await asyncio.sleep(0.1)

    # Both plugins should have received the event
    assert len(plugin1.get_received_events()) == 1
    assert len(plugin2.get_received_events()) == 1

    # Cleanup
    await plugin_manager.unregister("test-plugin-1")
    await plugin_manager.unregister("test-plugin-2")


@pytest.mark.asyncio
async def test_plugin_subscribes_to_multiple_system_events():
    """Test that a plugin can subscribe to multiple system event types."""
    # Create plugin subscribing to multiple events
    plugin = MockSystemEventBackendPlugin(
        "test-plugin-multi",
        "Test Plugin Multi",
        enabled=True,
        subscribed_events=[
            "plugin_enabled",
            "plugin_disabled",
            "plugin_installed",
            "plugin_instance_created",
        ],
    )

    # Register plugin
    await plugin_manager.register(plugin)

    # Emit multiple events
    await event_system.emit_event(
        "plugin_enabled",
        {
            "plugin_id": "test-plugin",
            "plugin_type": "backend",
            "enabled_at": "2024-01-01T00:00:00Z",
        },
        wait_for_handlers=False,
    )
    await asyncio.sleep(0.05)

    await event_system.emit_event(
        "plugin_disabled",
        {
            "plugin_id": "test-plugin",
            "plugin_type": "backend",
            "disabled_at": "2024-01-01T00:00:00Z",
        },
        wait_for_handlers=False,
    )
    await asyncio.sleep(0.05)

    await event_system.emit_event(
        "plugin_installed",
        {
            "plugin_id": "new-plugin",
            "plugin_type": "backend",
            "version": "1.0.0",
            "installed_at": "2024-01-01T00:00:00Z",
        },
        wait_for_handlers=False,
    )
    await asyncio.sleep(0.05)

    await event_system.emit_event(
        "plugin_instance_created",
        {
            "instance_id": "instance-123",
            "plugin_id": "test-plugin",
            "name": "Test Instance",
            "created_at": "2024-01-01T00:00:00Z",
        },
        wait_for_handlers=False,
    )
    await asyncio.sleep(0.1)

    # Plugin should have received all events
    received = plugin.get_received_events()
    assert len(received) == 4
    event_types = [event[0] for event in received]
    assert "plugin_enabled" in event_types
    assert "plugin_disabled" in event_types
    assert "plugin_installed" in event_types
    assert "plugin_instance_created" in event_types

    # Cleanup
    await plugin_manager.unregister("test-plugin-multi")
