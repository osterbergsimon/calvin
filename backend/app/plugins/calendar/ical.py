"""Generic iCal calendar plugin (for Proton, etc.)."""

from datetime import datetime
from typing import Any

import httpx
from loguru import logger

from app.models.calendar import CalendarEvent
from app.plugins.definitions import PluginMetadata
from app.plugins.protocols import CalendarPlugin
from app.utils.ical_parser import parse_ical_from_url

_ICAL_INSTANCE_SCHEMA = {
    "ical_url": {
        "type": "string",
        "description": "iCal feed URL",
        "default": "",
        "ui": {
            "component": "input",
            "placeholder": "https://example.com/calendar.ics",
            "validation": {
                "required": True,
                "type": "url",
            },
        },
    },
}


class ICalCalendarPlugin(CalendarPlugin):
    """Generic iCal calendar plugin for any iCal-compatible source."""

    metadata = PluginMetadata(
        type_id="ical",
        name="iCal Feed",
        description="Generic iCal feed (Proton, Outlook, etc.)",
        default_instance_name="iCal Feed",
        # Same feed URL -> same instance
        instance_identity=["ical_url"],
        instance_config_schema=_ICAL_INSTANCE_SCHEMA,
    )

    async def initialize(self) -> None:
        """Validate the configured feed URL."""
        url = self.config.get("ical_url", "")
        if not url or not url.startswith("http"):
            raise ValueError(f"Invalid iCal URL: {url}")

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
            ical_url = self.config.get("ical_url", "")
            logger.debug(
                f"[ICAL PLUGIN] Fetching events for {self.plugin_id} "
                f"({start_date.date()} to {end_date.date()})"
            )
            ical_events = await parse_ical_from_url(ical_url)
            logger.debug(
                "[ICAL PLUGIN] Fetched {} raw events from {}",
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
                "[ICAL PLUGIN] Filtered to {} events for date range ({} to {})",
                len(filtered_events),
                start_date.date(),
                end_date.date(),
            )
            return filtered_events
        except httpx.HTTPStatusError as e:
            # Re-raise HTTP errors so they can be handled by the service layer
            logger.error(
                "HTTP {} error fetching from {}: {}",
                e.response.status_code,
                self.plugin_id,
                e,
            )
            raise
        except Exception:
            logger.exception("[ICAL PLUGIN] Error fetching events from {}", self.plugin_id)
            raise

    @classmethod
    async def validate_config(cls, config: dict[str, Any]) -> bool:
        """Require an http(s) feed URL."""
        url = cls.normalize_config(config).get("ical_url") or ""
        return url.startswith(("http://", "https://"))


class ProtonCalendarPlugin(ICalCalendarPlugin):
    """Proton Calendar — the iCal plugin registered under its own type id."""

    metadata = PluginMetadata(
        type_id="proton",
        name="Proton Calendar",
        description="Proton Calendar via iCal feed",
        default_instance_name="Proton Calendar",
        instance_identity=["ical_url"],
        instance_config_schema=_ICAL_INSTANCE_SCHEMA,
    )
