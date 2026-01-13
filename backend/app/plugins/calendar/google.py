"""Google Calendar plugin."""

import re
from datetime import datetime
from typing import Any
from urllib.parse import quote

import httpx
from loguru import logger

from app.models.calendar import CalendarEvent
from app.plugins.base import PluginType
from app.plugins.hooks import hookimpl
from app.plugins.protocols import CalendarPlugin
from app.utils.ical_parser import parse_ical_from_url

# Loguru automatically includes module/function info in logs


def _is_google_calendar_url(url: str) -> bool:
    """Check if URL is a Google Calendar URL."""
    return "calendar.google.com" in url


def _convert_share_url_to_ical(share_url: str) -> str | None:
    """
    Convert Google Calendar share URL to iCal feed URL.

    Args:
        share_url: Google Calendar share URL
            Example: https://calendar.google.com/calendar/u/0?cid=...

    Returns:
        iCal feed URL or None if conversion fails
    """
    # Extract calendar ID from share URL
    cid_match = re.search(r"[?&]cid=([^&]+)", share_url)
    if not cid_match:
        return None

    calendar_id = cid_match.group(1)

    # URL encode the calendar ID properly
    calendar_id_encoded = quote(calendar_id, safe="")

    # Convert to iCal feed URL
    ical_url = f"https://calendar.google.com/calendar/ical/{calendar_id_encoded}/basic.ics"

    return ical_url


def _normalize_google_calendar_url(url: str) -> str:
    """
    Normalize Google Calendar URL to iCal format.

    If it's already an iCal URL (including private URLs with tokens), return as-is.
    If it's a share URL, convert to iCal.

    Args:
        url: Google Calendar URL (share or iCal, including private URLs)

    Returns:
        iCal feed URL
    """
    # If already an iCal URL (ends with .ics or has /ical/ in path), return as-is
    if url.endswith(".ics") or "/ical/" in url:
        return url

    # If it's a share URL, convert it
    if _is_google_calendar_url(url):
        ical_url = _convert_share_url_to_ical(url)
        if ical_url:
            return ical_url

    # If we can't convert, return original (might be a different format or already correct)
    return url


class GoogleCalendarPlugin(CalendarPlugin):
    """Google Calendar plugin using iCal feeds."""

    @classmethod
    def get_plugin_metadata(cls) -> dict[str, Any]:
        """Get plugin metadata for registration."""
        return {
            "type_id": "google",
            "plugin_type": PluginType.CALENDAR,
            "name": "Google Calendar",
            "description": "Google Calendar via iCal feed",
            "version": "1.0.0",
            "common_config_schema": {},
            "plugin_class": cls,
        }

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
        self._normalized_url = _normalize_google_calendar_url(self.ical_url)

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
            logger.debug(
                f"[GOOGLE PLUGIN] Fetching events for {self.plugin_id} "
                f"({start_date.date()} to {end_date.date()})"
            )
            ical_events = await parse_ical_from_url(self._normalized_url)
            logger.debug(
                "[GOOGLE PLUGIN] Fetched {} raw events from {}",
                len(ical_events),
                self.plugin_id,
            )

            # Filter events by date range
            filtered_events = []
            for event in ical_events:
                # Event overlaps if: event starts before range ends
                # AND event ends after range starts
                if event.start <= end_date and event.end >= start_date:
                    # Update source ID to match plugin ID
                    updated_event = event.model_copy(update={"source": self.plugin_id})
                    filtered_events.append(updated_event)

            logger.debug(
                "[GOOGLE PLUGIN] Filtered to {} events for date range ({} to {})",
                len(filtered_events),
                start_date.date(),
                end_date.date(),
            )
            return filtered_events
        except httpx.HTTPStatusError as e:
            # Re-raise HTTP errors so they can be handled by the service layer
            logger.error(
                f"[GOOGLE PLUGIN] HTTP {e.response.status_code} error fetching from "
                f"{self.plugin_id}: {e}"
            )
            raise
        except Exception as e:
            logger.error(
                f"[GOOGLE PLUGIN] Error fetching events from {self.plugin_id}: {e}",
                exc_info=True,
            )
            raise

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


# Register this plugin with pluggy
@hookimpl
def register_plugin_types() -> list[dict[str, Any]]:
    """Register GoogleCalendarPlugin type."""
    return [GoogleCalendarPlugin.get_plugin_metadata()]


@hookimpl
def create_plugin_instance(
    plugin_id: str,
    type_id: str,
    name: str,
    config: dict[str, Any],
) -> GoogleCalendarPlugin | None:
    """Create a GoogleCalendarPlugin instance."""
    if type_id != "google":
        return None

    enabled = config.get("enabled", False)  # Default to disabled
    ical_url = config.get("ical_url", "")

    return GoogleCalendarPlugin(
        plugin_id=plugin_id,
        name=name,
        ical_url=ical_url,
        enabled=enabled,
    )
