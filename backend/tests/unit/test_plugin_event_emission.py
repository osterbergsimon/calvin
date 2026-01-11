"""Unit tests for plugin event emission."""

import asyncio
from typing import Any

import pytest

from app.plugins.base import PluginType
from app.plugins.protocols import BackendPlugin
from app.services.event_system import event_system


class MockEventPublisherPlugin(BackendPlugin):
    """Mock BackendPlugin that emits events for testing."""

    def __init__(self, plugin_id: str, name: str, enabled: bool = True):
        super().__init__(plugin_id, name, enabled)
        self._emitted_events = []

    @classmethod
    def get_plugin_metadata(cls):
        return {"type_id": "test_publisher", "plugin_type": PluginType.BACKEND}

    @property
    def plugin_type(self) -> PluginType:
        return PluginType.BACKEND

    async def initialize(self) -> None:
        pass

    async def cleanup(self) -> None:
        pass

    async def validate_config(self, config: dict[str, Any]) -> bool:
        return True

    async def emit_test_event(
        self, event_type: str, event_data: dict[str, Any], wait_for_handlers: bool = False
    ) -> dict[str, Any] | None:
        """Helper method to emit events for testing."""
        result = await self.emit_event(event_type, event_data, wait_for_handlers)
        self._emitted_events.append((event_type, event_data, result))
        return result

    def get_emitted_events(self) -> list[tuple[str, dict[str, Any], Any]]:
        """Get list of emitted events for testing."""
        return self._emitted_events.copy()


class MockEventSubscriberPlugin(BackendPlugin):
    """Mock BackendPlugin that subscribes to events for testing."""

    def __init__(self, plugin_id: str, name: str, enabled: bool = True):
        super().__init__(plugin_id, name, enabled)
        self._received_events = []

    @classmethod
    def get_plugin_metadata(cls):
        return {"type_id": "test_subscriber", "plugin_type": PluginType.BACKEND}

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
        return ["test_event", "another_event"]

    async def handle_event(
        self, event_type: str, event_data: dict[str, Any]
    ) -> dict[str, Any] | None:
        self._received_events.append((event_type, event_data))
        return {"handled": True, "plugin_id": self.plugin_id}

    def get_received_events(self) -> list[tuple[str, dict[str, Any]]]:
        """Get list of received events for testing."""
        return self._received_events.copy()


@pytest.mark.asyncio
async def test_plugin_can_emit_event():
    """Test that plugins can emit events using emit_event method."""
    plugin = MockEventPublisherPlugin("test-publisher", "Test Publisher")

    # Emit event (fire-and-forget)
    result = await plugin.emit_test_event("test_event", {"data": "test"}, wait_for_handlers=False)

    assert result is None  # Fire-and-forget returns None
    emitted = plugin.get_emitted_events()
    assert len(emitted) == 1
    assert emitted[0][0] == "test_event"
    assert emitted[0][1]["data"] == "test"


@pytest.mark.asyncio
async def test_plugin_emitted_event_received_by_subscriber():
    """Test that events emitted by a plugin are received by subscribers."""
    from app.plugins.manager import plugin_manager

    publisher = MockEventPublisherPlugin("test-publisher", "Test Publisher")
    subscriber = MockEventSubscriberPlugin("test-subscriber", "Test Subscriber")

    # Register both plugins (this will subscribe the subscriber)
    await plugin_manager.register(publisher)
    await plugin_manager.register(subscriber)

    # Wait a bit for subscription to complete
    await asyncio.sleep(0.1)

    # Emit event from publisher
    await publisher.emit_test_event("test_event", {"data": "test"}, wait_for_handlers=False)

    # Wait for event to be processed
    await asyncio.sleep(0.1)

    # Check that subscriber received the event
    received = subscriber.get_received_events()
    assert len(received) == 1
    assert received[0][0] == "test_event"
    assert received[0][1]["data"] == "test"

    # Cleanup
    await plugin_manager.unregister("test-publisher")
    await plugin_manager.unregister("test-subscriber")


@pytest.mark.asyncio
async def test_plugin_emit_event_fire_and_wait():
    """Test that plugins can emit events and wait for handlers."""
    from app.plugins.manager import plugin_manager

    publisher = MockEventPublisherPlugin("test-publisher-2", "Test Publisher 2")
    subscriber = MockEventSubscriberPlugin("test-subscriber-2", "Test Subscriber 2")

    # Register both plugins
    await plugin_manager.register(publisher)
    await plugin_manager.register(subscriber)

    # Wait a bit for subscription to complete
    await asyncio.sleep(0.1)

    # Emit event from publisher (fire-and-wait)
    result = await publisher.emit_test_event("test_event", {"data": "test"}, wait_for_handlers=True)

    # Should get results back
    assert result is not None
    assert "test-subscriber-2" in result
    assert result["test-subscriber-2"]["success"] is True

    # Check that subscriber received the event
    received = subscriber.get_received_events()
    assert len(received) == 1

    # Cleanup
    await plugin_manager.unregister("test-publisher-2")
    await plugin_manager.unregister("test-subscriber-2")


@pytest.mark.asyncio
async def test_plugin_emit_event_multiple_subscribers():
    """Test that events emitted by a plugin are received by multiple subscribers."""
    from app.plugins.manager import plugin_manager

    publisher = MockEventPublisherPlugin("test-publisher-3", "Test Publisher 3")
    subscriber1 = MockEventSubscriberPlugin("test-subscriber-3a", "Test Subscriber 3a")
    subscriber2 = MockEventSubscriberPlugin("test-subscriber-3b", "Test Subscriber 3b")

    # Register all plugins
    await plugin_manager.register(publisher)
    await plugin_manager.register(subscriber1)
    await plugin_manager.register(subscriber2)

    # Wait a bit for subscriptions to complete
    await asyncio.sleep(0.1)

    # Emit event from publisher (fire-and-wait)
    result = await publisher.emit_test_event("test_event", {"data": "test"}, wait_for_handlers=True)

    # Should get results from both subscribers
    assert result is not None
    assert len(result) == 2
    assert "test-subscriber-3a" in result
    assert "test-subscriber-3b" in result

    # Check that both subscribers received the event
    received1 = subscriber1.get_received_events()
    received2 = subscriber2.get_received_events()
    assert len(received1) == 1
    assert len(received2) == 1

    # Cleanup
    await plugin_manager.unregister("test-publisher-3")
    await plugin_manager.unregister("test-subscriber-3a")
    await plugin_manager.unregister("test-subscriber-3b")


@pytest.mark.asyncio
async def test_plugin_emit_event_no_subscribers():
    """Test that plugins can emit events even when no subscribers exist."""
    plugin = MockEventPublisherPlugin("test-publisher-4", "Test Publisher 4")

    # Emit event with no subscribers
    result = await plugin.emit_test_event("test_event", {"data": "test"}, wait_for_handlers=False)

    # Should not error, just return None
    assert result is None

    # Emit event with wait_for_handlers=True and no subscribers
    result = await plugin.emit_test_event("test_event", {"data": "test"}, wait_for_handlers=True)

    # Should return empty dict
    assert result == {}


@pytest.mark.asyncio
async def test_plugin_emit_event_rate_limited():
    """Test that plugin-emitted events are rate limited."""
    from app.plugins.manager import plugin_manager

    # Create event system with low rate limit for testing
    test_event_system = event_system
    original_max = test_event_system._max_events_per_second
    test_event_system._max_events_per_second = 10  # 10 events per second

    publisher = MockEventPublisherPlugin("test-publisher-5", "Test Publisher 5")
    subscriber = MockEventSubscriberPlugin("test-subscriber-5", "Test Subscriber 5")

    # Register plugins
    await plugin_manager.register(publisher)
    await plugin_manager.register(subscriber)

    # Wait for subscription
    await asyncio.sleep(0.1)

    # Emit many events rapidly (more than 10 per second)
    for i in range(20):
        await publisher.emit_test_event("test_event", {"data": f"test{i}"}, wait_for_handlers=False)

    # Wait for handlers
    await asyncio.sleep(0.2)

    # Should be rate limited (not all 20 events received)
    received = subscriber.get_received_events()
    assert len(received) <= 10  # Rate limited to 10 events per second

    # Restore original rate limit
    test_event_system._max_events_per_second = original_max

    # Cleanup
    await plugin_manager.unregister("test-publisher-5")
    await plugin_manager.unregister("test-subscriber-5")
