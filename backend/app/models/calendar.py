"""Calendar data models."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class CalendarEvent(BaseModel):
    """Calendar event model."""

    id: str
    title: str
    start: datetime
    end: datetime
    description: Optional[str] = None
    location: Optional[str] = None
    source: str  # 'google' or 'proton'
    color: Optional[str] = None
    all_day: bool = False


class CalendarSource(BaseModel):
    """Calendar source model."""

    id: str
    type: str  # 'google' or 'proton'
    name: str
    enabled: bool = True
    ical_url: Optional[str] = None  # For Google Calendar share links
    api_key: Optional[str] = None  # For API-based sources
    color: Optional[str] = None  # Hex color code for calendar events (e.g., "#2196f3")
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

