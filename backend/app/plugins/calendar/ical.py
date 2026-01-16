"""Generic iCal calendar plugin (for Proton, etc.)."""

import hashlib
from datetime import datetime
from typing import Any

import httpx
from loguru import logger

from app.models.calendar import CalendarEvent
from app.plugins.base import PluginType
from app.plugins.hooks import hookimpl
from app.plugins.protocols import CalendarPlugin
from app.plugins.utils.config import extract_config_value, to_str
from app.plugins.utils.instance_manager import (
    InstanceManagerConfig,
    handle_plugin_config_update_generic,
)
from app.utils.ical_parser import parse_ical_from_url

# Loguru automatically includes module/function info in logs


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
            "instance_config_schema": {
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
            },
            "supports_multiple_instances": True,  # Multi-instance plugin
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
            logger.debug(
                f"[ICAL PLUGIN] Fetching events for {self.plugin_id} "
                f"({start_date.date()} to {end_date.date()})"
            )
            ical_events = await parse_ical_from_url(self.ical_url)
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
        except Exception as e:
            logger.error(
                f"[ICAL PLUGIN] Error fetching events from {self.plugin_id}: {e}",
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

        # Check if it's a valid HTTP(S) URL
        return url.startswith("http://") or url.startswith("https://")

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
    ical_url = extract_config_value(config, "ical_url", default="", converter=to_str)

    return ICalCalendarPlugin(
        plugin_id=plugin_id,
        name=name,
        ical_url=ical_url,
        enabled=enabled,
    )


@hookimpl
async def handle_plugin_config_update(
    type_id: str,
    config: dict[str, Any],
    enabled: bool | None,
    db_type: Any,
    session: Any,
) -> dict[str, Any] | None:
    """Handle iCal/Proton Calendar plugin configuration update and instance management."""
    if type_id not in ("ical", "proton"):
        return None

    def normalize_config(c: dict[str, Any]) -> dict[str, Any]:
        """Normalize config values."""
        ical_url = extract_config_value(c, "ical_url", converter=to_str)
        return {"ical_url": ical_url or ""}

    def validate_config(c: dict[str, Any]) -> bool:
        """Validate config has required ical_url."""
        if "ical_url" not in c:
            return False

        url = extract_config_value(c, "ical_url", converter=to_str)
        if not url or not url.strip():
            return False

        # Check if it's a valid HTTP(S) URL
        return url.startswith("http://") or url.startswith("https://")

    def generate_instance_id(c: dict[str, Any], t: str) -> str:
        """Generate instance ID from ical_url."""
        ical_url = extract_config_value(c, "ical_url", converter=to_str)
        if ical_url:
            # Generate hash from URL (same instance for same URL)
            url_hash = hashlib.md5(ical_url.encode()).hexdigest()[:8]
            return f"{t}-{url_hash}"
        # Fallback ID if URL not available
        return f"{t}-instance"

    manager_config = InstanceManagerConfig(
        type_id=type_id,  # Can be "ical" or "proton"
        single_instance=False,  # Multi-instance plugin
        normalize_config=normalize_config,
        validate_config=validate_config,
        generate_instance_id=generate_instance_id,
        default_instance_name="iCal Feed" if type_id == "ical" else "Proton Calendar",
    )

    return await handle_plugin_config_update_generic(
        type_id, config, enabled, db_type, session, manager_config
    )
