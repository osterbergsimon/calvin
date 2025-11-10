"""Calendar source plugins."""

from app.plugins.calendar.google import GoogleCalendarPlugin
from app.plugins.calendar.ical import ICalCalendarPlugin

__all__ = [
    "GoogleCalendarPlugin",
    "ICalCalendarPlugin",
]

