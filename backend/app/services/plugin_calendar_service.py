"""Calendar service using plugin architecture."""

from datetime import datetime, timedelta

from app.models.calendar import CalendarEvent
from app.plugins.base import PluginType
from app.plugins.manager import plugin_manager
from app.plugins.protocols import CalendarPlugin


class PluginCalendarService:
    """Calendar service using plugin architecture."""

    def __init__(self):
        """Initialize calendar service."""
        self._cache: dict = {}
        self._cache_ttl = timedelta(minutes=5)

    async def get_sources_async(self) -> list[dict]:
        """Get all calendar sources (async version)."""
        return await self.get_sources()

    def clear_cache(self) -> None:
        """Clear the event cache."""
        self._cache.clear()

    async def get_events(
        self,
        start_date: datetime,
        end_date: datetime,
        source_ids: list[str] | None = None,
    ) -> list[CalendarEvent]:
        """
        Get calendar events for a date range from all enabled calendar plugins.

        Args:
            start_date: Start date for events (timezone-aware or naive)
            end_date: End date for events (timezone-aware or naive)
            source_ids: Optional list of source IDs to filter by

        Returns:
            List of calendar events (all timezone-aware)
        """
        from datetime import UTC

        events: list[CalendarEvent] = []

        # Normalize start_date and end_date to timezone-aware (UTC if naive)
        if start_date.tzinfo is None:
            start_date = start_date.replace(tzinfo=UTC)
        if end_date.tzinfo is None:
            end_date = end_date.replace(tzinfo=UTC)

        # Get all enabled calendar plugins
        plugins = plugin_manager.get_plugins(PluginType.CALENDAR, enabled_only=True)

        # Filter by source IDs if specified
        if source_ids:
            plugins = [p for p in plugins if p.plugin_id in source_ids]

        # Fetch events from all plugins
        for plugin in plugins:
            if not isinstance(plugin, CalendarPlugin):
                continue

            # Check cache first
            cache_key = f"{plugin.plugin_id}:{start_date.isoformat()}:{end_date.isoformat()}"
            if cache_key in self._cache:
                cached_data = self._cache[cache_key]
                if datetime.now() - cached_data["timestamp"] < self._cache_ttl:
                    events.extend(cached_data["events"])
                    continue

            # Fetch events from plugin
            try:
                plugin_events = await plugin.fetch_events(start_date, end_date)

                # Cache the results
                self._cache[cache_key] = {
                    "events": plugin_events,
                    "timestamp": datetime.now(),
                }

                events.extend(plugin_events)
            except Exception as e:
                print(f"Error fetching events from calendar plugin {plugin.plugin_id}: {e}")
                # Try to use cached data if available
                if cache_key in self._cache:
                    events.extend(self._cache[cache_key]["events"])

        return events

    async def get_sources(self) -> list[dict]:
        """
        Get all calendar sources (plugins).

        Returns:
            List of calendar source dictionaries
        """
        plugins = plugin_manager.get_plugins(PluginType.CALENDAR, enabled_only=False)

        sources = []
        for plugin in plugins:
            if not isinstance(plugin, CalendarPlugin):
                continue

            config = plugin.get_config()
            sources.append({
                "id": plugin.plugin_id,
                "type": self._get_plugin_type_name(plugin),
                "name": plugin.name,
                "enabled": plugin.enabled,
                "ical_url": getattr(plugin, "ical_url", None),
                "api_key": getattr(plugin, "api_key", None),
                "color": config.get("color"),
                "show_time": config.get("show_time", True),
            })

        return sources

    def _get_plugin_type_name(self, plugin: CalendarPlugin) -> str:
        """Get plugin type name for backward compatibility."""
        # Check the class name
        class_name = plugin.__class__.__name__
        if "Google" in class_name:
            return "google"
        elif "ICal" in class_name:
            # Check if it's a Proton calendar by looking at the plugin_id or name
            plugin_id = getattr(plugin, "plugin_id", "")
            plugin_name = getattr(plugin, "name", "").lower()
            if "proton" in plugin_id.lower() or "proton" in plugin_name:
                return "proton"
            return "ical"

        # Default to ical for unknown types
        return "ical"

