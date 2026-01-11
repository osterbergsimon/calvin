"""Lightweight, non-blocking event system using asyncio."""

import asyncio
import time
from collections.abc import Callable
from typing import Any

from loguru import logger


class EventSystem:
    """Lightweight, non-blocking event system using asyncio."""

    def __init__(self, max_events_per_second: int = 10):
        """
        Initialize event system.

        Args:
            max_events_per_second: Maximum events per second per plugin per event type
        """
        self._subscribers: dict[str, list[tuple[str, Callable]]] = {}
        # plugin_id -> {event_type: last_emit_time}
        self._rate_limiter: dict[str, dict[str, float]] = {}
        self._max_events_per_second = max_events_per_second

    async def emit_event(
        self,
        event_type: str,
        event_data: dict[str, Any],
        wait_for_handlers: bool = False,
    ) -> dict[str, Any] | None:
        """
        Emit an event to all subscribed plugins.

        Args:
            event_type: Type of event (e.g., 'image_uploaded')
            event_data: Event payload (plugin-specific)
            wait_for_handlers: If True, wait for all handlers to complete (fire-and-wait)
                              If False, return immediately (fire-and-forget, default)

        Returns:
            If wait_for_handlers=True: dict with handler results
            If wait_for_handlers=False: None (returns immediately)
        """
        if event_type not in self._subscribers:
            return None if not wait_for_handlers else {}

        handlers = self._subscribers[event_type]
        if not handlers:
            return None if not wait_for_handlers else {}

        # Create tasks for all handlers (non-blocking)
        tasks = []
        for plugin_id, handler in handlers:
            # Check rate limiting
            if self._should_rate_limit(plugin_id, event_type):
                logger.debug(f"Rate limiting event {event_type} for plugin {plugin_id}")
                continue

            # Create task for handler (runs in background)
            task = self._create_handler_task(plugin_id, handler, event_type, event_data)
            tasks.append(task)

        if not tasks:
            return None if not wait_for_handlers else {}

        if wait_for_handlers:
            # Wait for all handlers to complete
            results = await asyncio.gather(*tasks, return_exceptions=True)
            return self._process_handler_results(results, handlers)
        else:
            # Fire-and-forget: don't wait for handlers
            # Tasks run in background, errors are logged but not propagated
            asyncio.create_task(self._await_handlers_with_error_handling(tasks, handlers))
            return None

    def _create_handler_task(
        self,
        plugin_id: str,
        handler: Callable,
        event_type: str,
        event_data: dict[str, Any],
    ) -> asyncio.Task:
        """Create a task for a handler with error isolation."""

        async def safe_handler():
            try:
                result = await handler(event_type, event_data)
                return {"plugin_id": plugin_id, "success": True, "result": result}
            except Exception as e:
                logger.error(
                    f"Error in event handler {plugin_id} for event {event_type}: {e}",
                    exc_info=True,
                )
                return {"plugin_id": plugin_id, "success": False, "error": str(e)}

        return asyncio.create_task(safe_handler())

    async def _await_handlers_with_error_handling(
        self,
        tasks: list[asyncio.Task],
        handlers: list[tuple[str, Callable]],
    ) -> None:
        """Await handlers and log errors without propagating."""
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for result, (plugin_id, _) in zip(results, handlers):
            if isinstance(result, Exception):
                logger.error(
                    f"Exception in event handler {plugin_id}: {result}",
                    exc_info=True,
                )
            elif result and not result.get("success", False):
                logger.warning(f"Event handler {plugin_id} returned error: {result.get('error')}")

    def _should_rate_limit(self, plugin_id: str, event_type: str) -> bool:
        """Check if plugin should be rate-limited for this event type."""
        now = time.time()
        plugin_limits = self._rate_limiter.get(plugin_id, {})
        last_emit = plugin_limits.get(event_type, 0)

        min_interval = 1.0 / self._max_events_per_second
        if now - last_emit < min_interval:
            return True

        # Update last emit time
        if plugin_id not in self._rate_limiter:
            self._rate_limiter[plugin_id] = {}
        self._rate_limiter[plugin_id][event_type] = now

        return False

    def subscribe(self, plugin_id: str, event_types: list[str], handler: Callable) -> None:
        """
        Subscribe a plugin to event types.

        Args:
            plugin_id: ID of plugin subscribing
            event_types: List of event types to subscribe to
            handler: Async function(event_type, event_data) -> dict | None
        """
        for event_type in event_types:
            if event_type not in self._subscribers:
                self._subscribers[event_type] = []

            # Remove existing subscription if present
            self._subscribers[event_type] = [
                (pid, h) for pid, h in self._subscribers[event_type] if pid != plugin_id
            ]

            # Add new subscription
            self._subscribers[event_type].append((plugin_id, handler))
            logger.debug(f"Plugin {plugin_id} subscribed to event type {event_type}")

    def unsubscribe(self, plugin_id: str, event_types: list[str] | None = None) -> None:
        """
        Unsubscribe a plugin from event types.

        Args:
            plugin_id: ID of plugin to unsubscribe
            event_types: List of event types (None = unsubscribe from all)
        """
        if event_types is None:
            # Unsubscribe from all event types
            for event_type in list(self._subscribers.keys()):
                self._subscribers[event_type] = [
                    (pid, h) for pid, h in self._subscribers[event_type] if pid != plugin_id
                ]
        else:
            # Unsubscribe from specific event types
            for event_type in event_types:
                if event_type in self._subscribers:
                    self._subscribers[event_type] = [
                        (pid, h) for pid, h in self._subscribers[event_type] if pid != plugin_id
                    ]

        # Clean up rate limiter
        if plugin_id in self._rate_limiter:
            del self._rate_limiter[plugin_id]

        logger.debug(f"Plugin {plugin_id} unsubscribed from events")

    def _process_handler_results(
        self,
        results: list[Any],
        handlers: list[tuple[str, Callable]],
    ) -> dict[str, Any]:
        """Process handler results when waiting for handlers."""
        processed = {}
        for result, (plugin_id, _) in zip(results, handlers):
            if isinstance(result, Exception):
                processed[plugin_id] = {"success": False, "error": str(result)}
            elif isinstance(result, dict):
                processed[plugin_id] = result
            else:
                processed[plugin_id] = {"success": True, "result": result}
        return processed


# Global event system instance
event_system = EventSystem()
