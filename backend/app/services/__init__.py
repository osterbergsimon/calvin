"""Service module exports."""

# Legacy services (for backward compatibility)
from app.services.calendar_service import calendar_service
# Note: image_service is imported as a module, not as a variable
# This allows main.py and routes to use: from app.services import image_service as image_service_module
# and then access: image_service_module.image_service

# Plugin-based services
from app.services.plugin_calendar_service import PluginCalendarService
from app.services.plugin_image_service import PluginImageService

# Create global instances
plugin_calendar_service = PluginCalendarService()
plugin_image_service = PluginImageService()

__all__ = [
    "calendar_service",
    "PluginCalendarService",
    "PluginImageService",
    "plugin_calendar_service",
    "plugin_image_service",
]
