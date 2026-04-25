"""Google Calendar plugin."""

import hashlib
import re
from datetime import datetime
from typing import Any
from urllib.parse import quote

import httpx
from loguru import logger

from app.models.calendar import CalendarEvent
from app.plugins.hooks import hookimpl
from app.plugins.protocols import CalendarPlugin
from app.plugins.sdk.calendar import (
    CalendarConfigField,
    build_calendar_manager_config,
    build_calendar_plugin_metadata,
    create_calendar_plugin_instance,
)
from app.plugins.utils.config import extract_config_value, to_str
from app.plugins.utils.instance_manager import handle_plugin_config_update_generic
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

    CALENDAR_FIELDS = (CalendarConfigField("ical_url", default="", converter=to_str),)

    @classmethod
    def get_plugin_metadata(cls) -> dict[str, Any]:
        """Get plugin metadata for registration."""
        return build_calendar_plugin_metadata(
            type_id="google",
            name="Google Calendar",
            description="Google Calendar via iCal feed",
            plugin_class=cls,
            common_config_schema={},
            instance_config_schema={
                "ical_url": {
                    "type": "string",
                    "description": "Google Calendar iCal URL or share URL",
                    "default": "",
                    "ui": {
                        "component": "input",
                        "placeholder": "https://calendar.google.com/calendar/ical/...",
                        "validation": {
                            "required": True,
                            "type": "url",
                        },
                    },
                },
            },
            supports_multiple_instances=True,
        )

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

        url = extract_config_value(config, "ical_url", converter=to_str)
        if not url or not url.strip():
            return False

        # Check if it's a Google Calendar URL
        return "calendar.google.com" in url or "google.com/calendar" in url

    async def configure(self, config: dict[str, Any]) -> None:
        """
        Configure the plugin with new settings.

        Args:
            config: Configuration dictionary
        """
        await super().configure(config)

        ical_url = extract_config_value(config, "ical_url", converter=to_str)
        if ical_url:
            self.ical_url = ical_url
            # Reset normalized URL so it gets recalculated on next use
            self._normalized_url = None


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
    return create_calendar_plugin_instance(
        GoogleCalendarPlugin,
        expected_type_ids="google",
        plugin_id=plugin_id,
        type_id=type_id,
        name=name,
        config=config,
        fields=GoogleCalendarPlugin.CALENDAR_FIELDS,
    )


@hookimpl
async def handle_plugin_config_update(
    type_id: str,
    config: dict[str, Any],
    enabled: bool | None,
    db_type: Any,
    session: Any,
) -> dict[str, Any] | None:
    """Handle Google Calendar plugin configuration update and instance management."""
    if type_id != "google":
        return None

    def validate_config(c: dict[str, Any]) -> bool:
        """Validate config has required ical_url."""
        if "ical_url" not in c:
            return False

        url = extract_config_value(c, "ical_url", converter=to_str)
        if not url or not url.strip():
            return False

        # Check if it's a Google Calendar URL
        return "calendar.google.com" in url or "google.com/calendar" in url

    def generate_instance_id(c: dict[str, Any], t: str) -> str:
        """Generate instance ID from ical_url."""
        ical_url = extract_config_value(c, "ical_url", converter=to_str)
        if ical_url:
            # Generate hash from URL (same instance for same URL)
            url_hash = hashlib.md5(ical_url.encode()).hexdigest()[:8]
            return f"{t}-{url_hash}"
        # Fallback ID if URL not available
        return f"{t}-instance"

    manager_config = build_calendar_manager_config(
        type_id="google",
        fields=GoogleCalendarPlugin.CALENDAR_FIELDS,
        single_instance=False,  # Multi-instance plugin
        validate_config=validate_config,
        generate_instance_id=generate_instance_id,
        default_instance_name="Google Calendar",
    )

    return await handle_plugin_config_update_generic(
        type_id, config, enabled, db_type, session, manager_config
    )
