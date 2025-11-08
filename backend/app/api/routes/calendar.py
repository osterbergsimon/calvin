"""Calendar API endpoints."""

from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Query, HTTPException
from app.models.calendar import (
    CalendarEventsResponse,
    CalendarSourcesResponse,
    CalendarSource,
)
from app.services.calendar_service import calendar_service

router = APIRouter()


def normalize_datetime(dt: Optional[datetime]) -> Optional[datetime]:
    """Normalize datetime to timezone-aware (UTC if naive)."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


@router.get("/calendar/events", response_model=CalendarEventsResponse)
async def get_calendar_events(
    start_date: Optional[datetime] = Query(None, description="Start date for events"),
    end_date: Optional[datetime] = Query(None, description="End date for events"),
    source_ids: Optional[str] = Query(None, description="Comma-separated source IDs"),
    refresh: Optional[bool] = Query(False, description="Force refresh (clear cache)"),
):
    """
    Get calendar events for a date range.

    If start_date and end_date are not provided, defaults to current month.
    """
    # Normalize datetimes to timezone-aware (UTC if naive)
    start_date = normalize_datetime(start_date)
    end_date = normalize_datetime(end_date)
    
    # Default to current month if not provided
    if not start_date:
        now = datetime.now(timezone.utc)
        start_date = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    
    if not end_date:
        if start_date:
            # End of month
            if start_date.month == 12:
                end_date = datetime(start_date.year + 1, 1, 1, tzinfo=timezone.utc) - timedelta(days=1)
            else:
                end_date = datetime(start_date.year, start_date.month + 1, 1, tzinfo=timezone.utc) - timedelta(days=1)
        else:
            now = datetime.now(timezone.utc)
            if now.month == 12:
                end_date = datetime(now.year + 1, 1, 1, tzinfo=timezone.utc) - timedelta(days=1)
            else:
                end_date = datetime(now.year, now.month + 1, 1, tzinfo=timezone.utc) - timedelta(days=1)

    # Parse source IDs if provided
    source_id_list = None
    if source_ids:
        source_id_list = [s.strip() for s in source_ids.split(",")]

    # Clear cache if refresh is requested
    if refresh:
        calendar_service.clear_cache()

    # Get events
    events = await calendar_service.get_events(start_date, end_date, source_id_list)

    return CalendarEventsResponse(
        events=events,
        start_date=start_date,
        end_date=end_date,
        total=len(events),
    )


@router.get("/calendar/sources", response_model=CalendarSourcesResponse)
async def get_calendar_sources():
    """Get all calendar sources."""
    sources = await calendar_service.get_sources()
    return CalendarSourcesResponse(sources=sources, total=len(sources))


@router.post("/calendar/sources", response_model=CalendarSource)
async def add_calendar_source(source: CalendarSource):
    """
    Add a new calendar source.
    
    For Google Calendar:
    - type: "google"
    - ical_url: The public iCal URL or share URL from Google Calendar
    - Share URL example: https://calendar.google.com/calendar/u/0?cid=...
    - iCal URL example: https://calendar.google.com/calendar/ical/.../basic.ics
    - The service will automatically convert share URLs to iCal format.
    
    For Proton Calendar:
    - type: "proton"
    - ical_url: The iCal feed URL from Proton Calendar
    - URL format: https://calendar.proton.me/api/calendar/v1/url/{calendar_id}/calendar.ics?CacheKey=...&PassphraseKey=...
    - You can get this URL from Proton Calendar's sharing settings.
    - The URL includes authentication parameters (CacheKey and PassphraseKey) in the query string.
    
    Calendar events are cached for 5 minutes and automatically refreshed.
    """
    # Normalize Google Calendar URLs if needed
    if source.type == 'google' and source.ical_url:
        from app.utils.google_calendar import normalize_google_calendar_url
        source.ical_url = normalize_google_calendar_url(source.ical_url)
    
    # Validate Proton Calendar URL format
    if source.type == 'proton' and source.ical_url:
        if not source.ical_url.startswith('https://calendar.proton.me/api/calendar/v1/url/'):
            raise HTTPException(
                status_code=400,
                detail="Invalid Proton Calendar URL. Expected format: https://calendar.proton.me/api/calendar/v1/url/{calendar_id}/calendar.ics?CacheKey=...&PassphraseKey=..."
            )
        if '/calendar.ics' not in source.ical_url:
            raise HTTPException(
                status_code=400,
                detail="Invalid Proton Calendar URL. Must include '/calendar.ics' endpoint."
            )
    
    return await calendar_service.add_source(source)


@router.put("/calendar/sources/{source_id}", response_model=CalendarSource)
async def update_calendar_source(source_id: str, source: CalendarSource):
    """Update a calendar source (e.g., color, show_time)."""
    updated = await calendar_service.update_source(source_id, source)
    if not updated:
        raise HTTPException(status_code=404, detail="Calendar source not found")
    return updated


@router.delete("/calendar/sources/{source_id}")
async def remove_calendar_source(source_id: str):
    """Remove a calendar source."""
    removed = await calendar_service.remove_source(source_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Calendar source not found")
    return {"message": "Calendar source removed", "source_id": source_id}

