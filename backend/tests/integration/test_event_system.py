"""Integration tests for event system with plugins."""

import asyncio
from typing import Any

import pytest

from app.plugins.base import PluginType
from app.plugins.manager import plugin_manager
from app.plugins.protocols import BackendPlugin
from app.services.event_system import event_system


class MockEventBackendPlugin(BackendPlugin):
    """Mock BackendPlugin that subscribes to events for testing."""

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
        return {"type_id": "test_event", "plugin_type": PluginType.BACKEND}

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
        self._received_events.clear()


@pytest.mark.asyncio
async def test_plugin_subscription_on_register():
    """Test that plugins are subscribed to events when registered."""
    # Create plugin that subscribes to image_uploaded events
    plugin = MockEventBackendPlugin(
        "test-plugin-1",
        "Test Plugin 1",
        enabled=True,
        subscribed_events=["image_uploaded"],
    )

    # Register plugin
    await plugin_manager.register(plugin)

    # Emit event
    await event_system.emit_event(
        "image_uploaded",
        {"image_id": "test123", "filename": "test.jpg", "plugin_id": "local-images"},
        wait_for_handlers=False,
    )

    # Wait for handler to complete
    await asyncio.sleep(0.1)

    # Check that plugin received the event
    received = plugin.get_received_events()
    assert len(received) == 1
    assert received[0][0] == "image_uploaded"
    assert received[0][1]["image_id"] == "test123"

    # Cleanup
    await plugin_manager.unregister("test-plugin-1")


@pytest.mark.asyncio
async def test_plugin_unsubscription_on_unregister():
    """Test that plugins are unsubscribed from events when unregistered."""
    # Create plugin
    plugin = MockEventBackendPlugin(
        "test-plugin-2",
        "Test Plugin 2",
        enabled=True,
        subscribed_events=["image_uploaded"],
    )

    # Register plugin
    await plugin_manager.register(plugin)

    # Emit event
    await event_system.emit_event(
        "image_uploaded",
        {"image_id": "test123", "filename": "test.jpg", "plugin_id": "local-images"},
        wait_for_handlers=False,
    )
    await asyncio.sleep(0.1)

    # Should have received event
    assert len(plugin.get_received_events()) == 1

    # Unregister plugin
    await plugin_manager.unregister("test-plugin-2")

    # Emit event again
    await event_system.emit_event(
        "image_uploaded",
        {"image_id": "test456", "filename": "test2.jpg", "plugin_id": "local-images"},
        wait_for_handlers=False,
    )
    await asyncio.sleep(0.1)

    # Should still have only 1 event (not received second event)
    assert len(plugin.get_received_events()) == 1


@pytest.mark.asyncio
async def test_multiple_plugins_subscribe_to_same_event():
    """Test that multiple plugins can subscribe to the same event."""
    # Create two plugins subscribing to same event
    plugin1 = MockEventBackendPlugin(
        "test-plugin-3",
        "Test Plugin 3",
        enabled=True,
        subscribed_events=["image_uploaded"],
    )
    plugin2 = MockEventBackendPlugin(
        "test-plugin-4",
        "Test Plugin 4",
        enabled=True,
        subscribed_events=["image_uploaded"],
    )

    # Register both plugins
    await plugin_manager.register(plugin1)
    await plugin_manager.register(plugin2)

    # Emit event
    await event_system.emit_event(
        "image_uploaded",
        {"image_id": "test123", "filename": "test.jpg", "plugin_id": "local-images"},
        wait_for_handlers=False,
    )
    await asyncio.sleep(0.1)

    # Both plugins should have received the event
    assert len(plugin1.get_received_events()) == 1
    assert len(plugin2.get_received_events()) == 1

    # Cleanup
    await plugin_manager.unregister("test-plugin-3")
    await plugin_manager.unregister("test-plugin-4")


@pytest.mark.asyncio
async def test_plugin_subscribes_to_multiple_event_types():
    """Test that a plugin can subscribe to multiple event types."""
    # Create plugin subscribing to multiple events
    plugin = MockEventBackendPlugin(
        "test-plugin-5",
        "Test Plugin 5",
        enabled=True,
        subscribed_events=["image_uploaded", "image_deleted"],
    )

    # Register plugin
    await plugin_manager.register(plugin)

    # Emit image_uploaded event
    await event_system.emit_event(
        "image_uploaded",
        {"image_id": "test123", "filename": "test.jpg", "plugin_id": "local-images"},
        wait_for_handlers=False,
    )
    await asyncio.sleep(0.1)

    # Emit image_deleted event
    await event_system.emit_event(
        "image_deleted",
        {"image_id": "test123", "filename": "test.jpg", "plugin_id": "local-images"},
        wait_for_handlers=False,
    )
    await asyncio.sleep(0.1)

    # Plugin should have received both events
    received = plugin.get_received_events()
    assert len(received) == 2
    assert received[0][0] == "image_uploaded"
    assert received[1][0] == "image_deleted"

    # Cleanup
    await plugin_manager.unregister("test-plugin-5")


@pytest.mark.asyncio
async def test_plugin_without_subscribed_events():
    """Test that plugins without subscribed events don't cause errors."""
    # Create plugin without subscribed events
    plugin = MockEventBackendPlugin(
        "test-plugin-6",
        "Test Plugin 6",
        enabled=True,
        subscribed_events=[],
    )

    # Register plugin (should not error)
    await plugin_manager.register(plugin)

    # Emit event
    await event_system.emit_event(
        "image_uploaded",
        {"image_id": "test123", "filename": "test.jpg", "plugin_id": "local-images"},
        wait_for_handlers=False,
    )
    await asyncio.sleep(0.1)

    # Plugin should not have received event
    assert len(plugin.get_received_events()) == 0

    # Cleanup
    await plugin_manager.unregister("test-plugin-6")
