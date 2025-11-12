"""Generic iCal calendar plugin (for Proton, etc.)."""

from datetime import datetime
from typing import Any

from app.models.calendar import CalendarEvent
from app.plugins.base import PluginType
from app.plugins.hooks import hookimpl, plugin_manager
from app.plugins.protocols import CalendarPlugin
from app.utils.ical_parser import parse_ical_from_url


class ICalCalendarPlugin(CalendarPlugin):
    """Generic iCal calendar plugin for any iCal-compatible source."""

    @classmethod
    def get_plugin_metadata(cls) -> dict[str, Any]:
        """Get plugin metadata for registration."""
        return {
            "type_id": "ical",
            "plugin_type": PluginType.CALENDAR,
            "name": "iCal Feed",
            "description": "Generic iCal feed (Proton, Outlook, etc.)",
            "version": "1.0.0",
            "common_config_schema": {},
            "plugin_class": cls,
        }

    def __init__(self, plugin_id: str, name: str, ical_url: str, enabled: bool = True):
        """
        Initialize iCal Calendar plugin.

        Args:
            plugin_id: Unique identifier for the plugin
            name: Human-readable name
            ical_url: iCal feed URL
            enabled: Whether the plugin is enabled
        """
        super().__init__(plugin_id, name, enabled)
        self.ical_url = ical_url

    async def initialize(self) -> None:
        """Initialize the plugin."""
        # Validate URL format
        if not self.ical_url or not self.ical_url.startswith("http"):
            raise ValueError(f"Invalid iCal URL: {self.ical_url}")

    async def cleanup(self) -> None:
        """Cleanup plugin resources."""
        # Nothing to cleanup for iCal
        pass

    async def fetch_events(
        self,
        start_date: datetime,
        end_date: datetime,
    ) -> list[CalendarEvent]:
        """
        Fetch calendar events for a date range.

        Args:
            start_date: Start date for events (timezone-aware)
            end_date: End date for events (timezone-aware)

        Returns:
            List of calendar events
        """
        try:
            # Fetch events from iCal URL
            ical_events = await parse_ical_from_url(self.ical_url)

            # Filter events by date range
            filtered_events = []
            for event in ical_events:
                # Event overlaps if: event starts before range ends AND event ends after range starts
                if event.start <= end_date and event.end >= start_date:
                    # Update source ID to match plugin ID
                    updated_event = event.model_copy(update={"source": self.plugin_id})
                    filtered_events.append(updated_event)

            return filtered_events
        except Exception as e:
            print(f"Error fetching events from iCal plugin {self.plugin_id}: {e}")
            return []

    async def validate_config(self, config: dict) -> bool:
        """
        Validate plugin configuration.

        Args:
            config: Configuration dictionary with 'ical_url' key

        Returns:
            True if configuration is valid
        """
        if "ical_url" not in config:
            return False

        url = config["ical_url"]
        if not isinstance(url, str) or not url.strip():
            return False

        # Check if it's a valid HTTP(S) URL
        return url.startswith("http://") or url.startswith("https://")


# Register this plugin with pluggy (for ical and proton types)
@hookimpl
def register_plugin_types() -> list[dict[str, Any]]:
    """Register ICalCalendarPlugin types (ical and proton)."""
    ical_metadata = ICalCalendarPlugin.get_plugin_metadata()
    # Also register as proton (same plugin, different type_id)
    proton_metadata = {
        "type_id": "proton",
        "plugin_type": PluginType.CALENDAR,
        "name": "Proton Calendar",
        "description": "Proton Calendar via iCal feed",
        "version": "1.0.0",
        "common_config_schema": {},
        "plugin_class": ICalCalendarPlugin,
    }
    return [ical_metadata, proton_metadata]


@hookimpl
def create_plugin_instance(
    plugin_id: str,
    type_id: str,
    name: str,
    config: dict[str, Any],
) -> ICalCalendarPlugin | None:
    """Create an ICalCalendarPlugin instance."""
    if type_id not in ("ical", "proton"):
        return None
    
    enabled = config.get("enabled", False)  # Default to disabled
    ical_url = config.get("ical_url", "")
    
    return ICalCalendarPlugin(
        plugin_id=plugin_id,
        name=name,
        ical_url=ical_url,
        enabled=enabled,
    )

