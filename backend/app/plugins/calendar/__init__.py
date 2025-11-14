"""Calendar source plugins."""

# Import all plugins to trigger their auto-registration
from app.plugins.calendar import (
    google,  # noqa: F401
    ical,  # noqa: F401
)
from app.plugins.calendar.google import GoogleCalendarPlugin
from app.plugins.calendar.ical import ICalCalendarPlugin

__all__ = [
    "GoogleCalendarPlugin",
    "ICalCalendarPlugin",
]
