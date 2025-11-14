"""Plugin type registry for managing plugin types and their common settings."""

from typing import Any

from app.plugins.base import PluginType
from app.plugins.calendar.google import GoogleCalendarPlugin
from app.plugins.calendar.ical import ICalCalendarPlugin
from app.plugins.image.local import LocalImagePlugin
from app.plugins.service.iframe import IframeServicePlugin


class PluginTypeInfo:
    """Information about a plugin type."""

    def __init__(
        self,
        type_id: str,
        name: str,
        plugin_type: PluginType,
        description: str,
        plugin_class: type,
        common_config_schema: dict[str, Any] | None = None,
    ):
        """
        Initialize plugin type info.

        Args:
            type_id: Unique identifier for the plugin type (e.g., 'google', 'ical', 'local')
            name: Human-readable name
            plugin_type: Plugin type (CALENDAR, IMAGE, SERVICE)
            description: Description of the plugin type
            plugin_class: Plugin class
            common_config_schema: Schema for common configuration settings
        """
        self.type_id = type_id
        self.name = name
        self.plugin_type = plugin_type
        self.description = description
        self.plugin_class = plugin_class
        self.common_config_schema = common_config_schema or {}


class PluginTypeRegistry:
    """Registry for plugin types."""

    def __init__(self):
        """Initialize plugin type registry."""
        self._types: dict[str, PluginTypeInfo] = {}
        self._register_default_types()

    def _register_default_types(self):
        """Register default plugin types."""
        # Calendar plugins
        self.register(
            PluginTypeInfo(
                type_id="google",
                name="Google Calendar",
                plugin_type=PluginType.CALENDAR,
                description="Google Calendar via iCal feed",
                plugin_class=GoogleCalendarPlugin,
                common_config_schema={},  # No common settings for Google Calendar
            )
        )
        self.register(
            PluginTypeInfo(
                type_id="ical",
                name="iCal Feed",
                plugin_type=PluginType.CALENDAR,
                description="Generic iCal feed (Proton, Outlook, etc.)",
                plugin_class=ICalCalendarPlugin,
                common_config_schema={},  # No common settings for iCal
            )
        )
        self.register(
            PluginTypeInfo(
                type_id="proton",
                name="Proton Calendar",
                plugin_type=PluginType.CALENDAR,
                description="Proton Calendar via iCal feed",
                plugin_class=ICalCalendarPlugin,
                common_config_schema={},  # No common settings for Proton
            )
        )

        # Image plugins
        self.register(
            PluginTypeInfo(
                type_id="local",
                name="Local Images",
                plugin_type=PluginType.IMAGE,
                description="Local filesystem image storage",
                plugin_class=LocalImagePlugin,
                common_config_schema={
                    "image_dir": {
                        "type": "string",
                        "description": "Default image directory path",
                        "default": "",
                    },
                    "thumbnail_dir": {
                        "type": "string",
                        "description": (
                            "Thumbnail directory path (optional, defaults to image_dir/thumbnails)"
                        ),
                        "default": "",
                    },
                },
            )
        )

        # Service plugins
        self.register(
            PluginTypeInfo(
                type_id="iframe",
                name="Iframe Service",
                plugin_type=PluginType.SERVICE,
                description="Web service displayed in iframe",
                plugin_class=IframeServicePlugin,
                common_config_schema={},  # No common settings for iframe
            )
        )

    def register(self, type_info: PluginTypeInfo):
        """Register a plugin type."""
        self._types[type_info.type_id] = type_info

    def get_type(self, type_id: str) -> PluginTypeInfo | None:
        """Get a plugin type by ID."""
        return self._types.get(type_id)

    def get_types(self, plugin_type: PluginType | None = None) -> list[PluginTypeInfo]:
        """
        Get all plugin types, optionally filtered by plugin type.

        Args:
            plugin_type: Optional plugin type filter

        Returns:
            List of plugin type info
        """
        types = list(self._types.values())
        if plugin_type:
            types = [t for t in types if t.plugin_type == plugin_type]
        return types

    def get_type_ids(self, plugin_type: PluginType | None = None) -> list[str]:
        """Get all plugin type IDs, optionally filtered by plugin type."""
        types = self.get_types(plugin_type)
        return [t.type_id for t in types]


# Global plugin type registry
plugin_type_registry = PluginTypeRegistry()
