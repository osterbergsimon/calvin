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
        Get all calendar sources (plugins) from database.
        Includes both enabled and disabled plugins.

        Returns:
            List of calendar source dictionaries
        """
        from app.database import AsyncSessionLocal
        from app.models.db_models import PluginDB
        from sqlalchemy import select

        sources = []
        
        # Query database for all calendar plugin instances
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(PluginDB).where(PluginDB.type_id.in_(
                    ["google", "ical", "proton"]  # Calendar plugin type IDs
                ))
            )
            db_plugins = result.scalars().all()
            
            for db_plugin in db_plugins:
                config = db_plugin.config or {}
                
                # Try to get plugin instance if it exists (only enabled plugins have instances)
                plugin = plugin_manager.get_plugin(db_plugin.id)
                if plugin and isinstance(plugin, CalendarPlugin):
                    # Use live plugin data
                    plugin_config = plugin.get_config()
                    sources.append({
                        "id": plugin.plugin_id,
                        "type": self._get_plugin_type_name(plugin),
                        "name": plugin.name,
                        "enabled": db_plugin.enabled,  # Use database enabled status
                        "running": plugin.is_running(),  # Runtime state
                        # Get plugin-specific config via protocol method (get_config)
                        "ical_url": plugin_config.get("ical_url") or config.get("ical_url"),
                        "api_key": plugin_config.get("api_key") or config.get("api_key"),
                        "color": plugin_config.get("color") or config.get("color"),
                        "show_time": plugin_config.get("show_time", config.get("show_time", True)),
                    })
                else:
                    # Plugin instance doesn't exist (disabled), use database data
                    type_id = db_plugin.type_id
                    sources.append({
                        "id": db_plugin.id,
                        "type": type_id,
                        "name": db_plugin.name,
                        "enabled": db_plugin.enabled,  # Use database enabled status
                        "running": False,  # No instance = not running
                        "ical_url": config.get("ical_url"),
                        "api_key": config.get("api_key"),
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

