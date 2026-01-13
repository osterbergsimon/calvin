"""Calendar data models."""

from datetime import datetime

from pydantic import BaseModel, Field


class CalendarEvent(BaseModel):
    """Calendar event model."""

    id: str
    title: str
    start: datetime
    end: datetime
    description: str | None = None
    location: str | None = None
    source: str  # 'google' or 'proton'
    color: str | None = None
    all_day: bool = False


class CalendarSource(BaseModel):
    """Calendar source model."""

    id: str
    type: str  # 'google' or 'proton'
    name: str
    enabled: bool = True  # Whether plugin is enabled (persisted in database)
    running: bool = False  # Whether plugin instance is currently running (runtime state)
    ical_url: str | None = None  # For Google Calendar share links
    api_key: str | None = None  # For API-based sources
    color: str | None = None  # Hex color code for calendar events (e.g., "#2196f3")
    show_time: bool = True  # Show event times in calendar


class CalendarEventsResponse(BaseModel):
    """Response model for calendar events."""

    events: list[CalendarEvent] = Field(default_factory=list)
    start_date: datetime
    end_date: datetime
    total: int = 0


class CalendarSourcesResponse(BaseModel):
    """Response model for calendar sources."""

    sources: list[CalendarSource] = Field(default_factory=list)
    total: int = 0
