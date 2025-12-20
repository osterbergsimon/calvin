"""Service module exports."""

# Plugin-based services
from app.services.plugin_calendar_service import PluginCalendarService
from app.services.plugin_image_service import PluginImageService

# Create global instances
plugin_calendar_service = PluginCalendarService()
plugin_image_service = PluginImageService()

__all__ = [
    "PluginCalendarService",
    "PluginImageService",
    "plugin_calendar_service",
    "plugin_image_service",
]
