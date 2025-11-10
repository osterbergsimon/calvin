"""Service module exports."""

# Legacy services (for backward compatibility)
from app.services.calendar_service import calendar_service
from app.services.image_service import image_service

# Plugin-based services
from app.services.plugin_calendar_service import PluginCalendarService
from app.services.plugin_image_service import PluginImageService

# Create global instances
plugin_calendar_service = PluginCalendarService()
plugin_image_service = PluginImageService()

__all__ = [
    "calendar_service",
    "image_service",
    "PluginCalendarService",
    "PluginImageService",
    "plugin_calendar_service",
    "plugin_image_service",
]
