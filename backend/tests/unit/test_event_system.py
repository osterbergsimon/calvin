"""Unit tests for event system."""

import asyncio
import time
from typing import Any

import pytest

from app.services.event_system import EventSystem


@pytest.mark.asyncio
async def test_emit_event_no_subscribers():
    """Test emitting event with no subscribers."""
    event_system = EventSystem()
    result = await event_system.emit_event("test_event", {"data": "test"})
    assert result is None


@pytest.mark.asyncio
async def test_subscribe_and_emit():
    """Test subscribing to events and receiving them."""
    event_system = EventSystem()
    received_events = []

    async def handler(event_type: str, event_data: dict[str, Any]) -> dict[str, Any] | None:
        received_events.append((event_type, event_data))
        return {"handled": True}

    # Subscribe to event
    event_system.subscribe("plugin1", ["test_event"], handler)

    # Emit event (fire-and-forget)
    await event_system.emit_event("test_event", {"data": "test"}, wait_for_handlers=False)

    # Wait a bit for async handler to complete
    await asyncio.sleep(0.1)

    assert len(received_events) == 1
    assert received_events[0][0] == "test_event"
    assert received_events[0][1]["data"] == "test"


@pytest.mark.asyncio
async def test_emit_event_fire_and_wait():
    """Test emitting event and waiting for handlers."""
    event_system = EventSystem()
    received_events = []

    async def handler(event_type: str, event_data: dict[str, Any]) -> dict[str, Any] | None:
        received_events.append((event_type, event_data))
        return {"handled": True, "plugin_id": "plugin1"}

    # Subscribe to event
    event_system.subscribe("plugin1", ["test_event"], handler)

    # Emit event (fire-and-wait)
    results = await event_system.emit_event("test_event", {"data": "test"}, wait_for_handlers=True)

    assert results is not None
    assert "plugin1" in results
    assert results["plugin1"]["success"] is True
    assert results["plugin1"]["result"]["handled"] is True
    assert len(received_events) == 1


@pytest.mark.asyncio
async def test_multiple_subscribers():
    """Test multiple plugins subscribing to same event."""
    event_system = EventSystem()
    plugin1_events = []
    plugin2_events = []

    async def handler1(event_type: str, event_data: dict[str, Any]) -> dict[str, Any] | None:
        plugin1_events.append((event_type, event_data))
        return {"handled": True, "plugin": "plugin1"}

    async def handler2(event_type: str, event_data: dict[str, Any]) -> dict[str, Any] | None:
        plugin2_events.append((event_type, event_data))
        return {"handled": True, "plugin": "plugin2"}

    # Subscribe both plugins
    event_system.subscribe("plugin1", ["test_event"], handler1)
    event_system.subscribe("plugin2", ["test_event"], handler2)

    # Emit event (fire-and-wait)
    results = await event_system.emit_event("test_event", {"data": "test"}, wait_for_handlers=True)

    assert len(results) == 2
    assert "plugin1" in results
    assert "plugin2" in results
    assert len(plugin1_events) == 1
    assert len(plugin2_events) == 1


@pytest.mark.asyncio
async def test_rate_limited_subscriber_does_not_misattribute_results():
    """When an earlier subscriber is rate-limited, remaining results must stay
    keyed to the correct plugin and must not be dropped (calvin-paf)."""
    event_system = EventSystem()
    a_events = []
    b_events = []

    async def handler_a(event_type: str, event_data: dict[str, Any]) -> dict[str, Any] | None:
        a_events.append(event_data)
        return {"handled": True, "plugin": "pluginA"}

    async def handler_b(event_type: str, event_data: dict[str, Any]) -> dict[str, Any] | None:
        b_events.append(event_data)
        return {"handled": True, "plugin": "pluginB"}

    # Subscription order matters: A is first in the handlers list.
    event_system.subscribe("pluginA", ["test_event"], handler_a)
    event_system.subscribe("pluginB", ["test_event"], handler_b)

    # Rate-limit only A (B has no recent emit), so only B's task is created.
    event_system._rate_limiter["pluginA"] = {"test_event": time.time()}

    results = await event_system.emit_event("test_event", {"data": "x"}, wait_for_handlers=True)

    # A was skipped: its handler never ran and it has no result entry.
    assert a_events == []
    assert "pluginA" not in results
    # B ran and its result is keyed to B, not misattributed to A.
    assert len(b_events) == 1
    assert list(results.keys()) == ["pluginB"]
    assert results["pluginB"]["success"] is True
    assert results["pluginB"]["result"] == {"handled": True, "plugin": "pluginB"}


@pytest.mark.asyncio
async def test_unsubscribe():
    """Test unsubscribing from events."""
    event_system = EventSystem()
    received_events = []

    async def handler(event_type: str, event_data: dict[str, Any]) -> dict[str, Any] | None:
        received_events.append((event_type, event_data))
        return {"handled": True}

    # Subscribe
    event_system.subscribe("plugin1", ["test_event"], handler)

    # Emit event
    await event_system.emit_event("test_event", {"data": "test1"}, wait_for_handlers=False)
    await asyncio.sleep(0.1)

    assert len(received_events) == 1

    # Unsubscribe
    event_system.unsubscribe("plugin1", ["test_event"])

    # Emit another event
    await event_system.emit_event("test_event", {"data": "test2"}, wait_for_handlers=False)
    await asyncio.sleep(0.1)

    # Should still be 1 (not received second event)
    assert len(received_events) == 1


@pytest.mark.asyncio
async def test_unsubscribe_all():
    """Test unsubscribing from all events."""
    event_system = EventSystem()
    received_events = []

    async def handler(event_type: str, event_data: dict[str, Any]) -> dict[str, Any] | None:
        received_events.append((event_type, event_data))
        return {"handled": True}

    # Subscribe to multiple event types
    event_system.subscribe("plugin1", ["event1", "event2"], handler)

    # Emit events
    await event_system.emit_event("event1", {"data": "test1"}, wait_for_handlers=False)
    await event_system.emit_event("event2", {"data": "test2"}, wait_for_handlers=False)
    await asyncio.sleep(0.1)

    assert len(received_events) == 2

    # Unsubscribe from all
    event_system.unsubscribe("plugin1")

    # Emit events again
    await event_system.emit_event("event1", {"data": "test3"}, wait_for_handlers=False)
    await event_system.emit_event("event2", {"data": "test4"}, wait_for_handlers=False)
    await asyncio.sleep(0.1)

    # Should still be 2 (not received new events)
    assert len(received_events) == 2


@pytest.mark.asyncio
async def test_handler_error_isolation():
    """Test that errors in one handler don't affect others."""
    event_system = EventSystem()
    plugin1_events = []
    plugin2_events = []

    async def handler1(event_type: str, event_data: dict[str, Any]) -> dict[str, Any] | None:
        plugin1_events.append((event_type, event_data))
        raise ValueError("Handler 1 error")

    async def handler2(event_type: str, event_data: dict[str, Any]) -> dict[str, Any] | None:
        plugin2_events.append((event_type, event_data))
        return {"handled": True, "plugin": "plugin2"}

    # Subscribe both plugins
    event_system.subscribe("plugin1", ["test_event"], handler1)
    event_system.subscribe("plugin2", ["test_event"], handler2)

    # Emit event (fire-and-wait)
    results = await event_system.emit_event("test_event", {"data": "test"}, wait_for_handlers=True)

    # Both handlers should have been called
    assert len(plugin1_events) == 1
    assert len(plugin2_events) == 1

    # Plugin1 should have error, plugin2 should succeed
    assert results["plugin1"]["success"] is False
    assert "error" in results["plugin1"]
    assert results["plugin2"]["success"] is True


@pytest.mark.asyncio
async def test_rate_limiting():
    """Test rate limiting per plugin per event type."""
    event_system = EventSystem(max_events_per_second=10)
    received_events = []

    async def handler(event_type: str, event_data: dict[str, Any]) -> dict[str, Any] | None:
        received_events.append((event_type, event_data))
        return {"handled": True}

    # Subscribe
    event_system.subscribe("plugin1", ["test_event"], handler)

    # Emit many events rapidly (more than 10 per second)
    for i in range(20):
        await event_system.emit_event("test_event", {"data": f"test{i}"}, wait_for_handlers=False)

    # Wait for handlers
    await asyncio.sleep(0.2)

    # Should be rate limited (not all 20 events received)
    # Exact number depends on timing, but should be <= 10
    assert len(received_events) <= 10


@pytest.mark.asyncio
async def test_multiple_event_types():
    """Test subscribing to multiple event types."""
    event_system = EventSystem()
    received_events = []

    async def handler(event_type: str, event_data: dict[str, Any]) -> dict[str, Any] | None:
        received_events.append((event_type, event_data))
        return {"handled": True}

    # Subscribe to multiple event types
    event_system.subscribe("plugin1", ["event1", "event2"], handler)

    # Emit different event types
    await event_system.emit_event("event1", {"data": "test1"}, wait_for_handlers=False)
    await event_system.emit_event("event2", {"data": "test2"}, wait_for_handlers=False)
    await event_system.emit_event("event3", {"data": "test3"}, wait_for_handlers=False)
    await asyncio.sleep(0.1)

    # Should receive event1 and event2, but not event3
    assert len(received_events) == 2
    assert received_events[0][0] == "event1"
    assert received_events[1][0] == "event2"


@pytest.mark.asyncio
async def test_resubscribe():
    """Test resubscribing with new handler."""
    event_system = EventSystem()
    received_events = []

    async def handler1(event_type: str, event_data: dict[str, Any]) -> dict[str, Any] | None:
        received_events.append(("handler1", event_type, event_data))
        return {"handled": True, "handler": "handler1"}

    async def handler2(event_type: str, event_data: dict[str, Any]) -> dict[str, Any] | None:
        received_events.append(("handler2", event_type, event_data))
        return {"handled": True, "handler": "handler2"}

    # Subscribe with handler1
    event_system.subscribe("plugin1", ["test_event"], handler1)

    # Emit event
    await event_system.emit_event("test_event", {"data": "test1"}, wait_for_handlers=False)
    await asyncio.sleep(0.1)

    assert len(received_events) == 1
    assert received_events[0][0] == "handler1"

    # Resubscribe with handler2
    event_system.subscribe("plugin1", ["test_event"], handler2)

    # Emit event again
    await event_system.emit_event("test_event", {"data": "test2"}, wait_for_handlers=False)
    await asyncio.sleep(0.1)

    # Should have 2 events, second one from handler2
    assert len(received_events) == 2
    assert received_events[1][0] == "handler2"
