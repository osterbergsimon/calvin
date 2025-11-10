"""Google Calendar plugin."""

from datetime import datetime

from app.models.calendar import CalendarEvent
from app.plugins.protocols import CalendarPlugin
from app.utils.google_calendar import normalize_google_calendar_url
from app.utils.ical_parser import parse_ical_from_url


class GoogleCalendarPlugin(CalendarPlugin):
    """Google Calendar plugin using iCal feeds."""

    def __init__(self, plugin_id: str, name: str, ical_url: str, enabled: bool = True):
        """
        Initialize Google Calendar plugin.

        Args:
            plugin_id: Unique identifier for the plugin
            name: Human-readable name
            ical_url: Google Calendar iCal URL or share URL
            enabled: Whether the plugin is enabled
        """
        super().__init__(plugin_id, name, enabled)
        self.ical_url = ical_url
        self._normalized_url: str | None = None

    async def initialize(self) -> None:
        """Initialize the plugin."""
        # Normalize URL (convert share URL to iCal if needed)
        self._normalized_url = normalize_google_calendar_url(self.ical_url)

    async def cleanup(self) -> None:
        """Cleanup plugin resources."""
        # Nothing to cleanup for Google Calendar
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
        if not self._normalized_url:
            await self.initialize()

        if not self._normalized_url:
            return []

        try:
            # Fetch events from Google Calendar iCal URL
            ical_events = await parse_ical_from_url(self._normalized_url)

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
            print(f"Error fetching events from Google Calendar plugin {self.plugin_id}: {e}")
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

        # Check if it's a Google Calendar URL
        return "calendar.google.com" in url or "google.com/calendar" in url

