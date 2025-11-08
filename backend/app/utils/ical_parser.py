"""iCal/ICS file parser for Google Calendar share links."""

from datetime import UTC, datetime

import httpx
from icalendar import Calendar

from app.models.calendar import CalendarEvent


async def parse_ical_from_url(url: str) -> list[CalendarEvent]:
    """
    Parse iCal/ICS file from a URL (e.g., Google Calendar share link).

    Args:
        url: URL to the iCal/ICS file

    Returns:
        List of calendar events
    """
    events: list[CalendarEvent] = []

    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            response = await client.get(url)
            response.raise_for_status()

            # Check if we got valid iCal content
            content_type = response.headers.get("content-type", "").lower()
            if "text/calendar" not in content_type and "text/plain" not in content_type:
                print(f"Warning: Unexpected content type {content_type} for iCal URL")

            # Parse iCal content
            calendar = Calendar.from_ical(response.content)

            for component in calendar.walk():
                if component.name == "VEVENT":
                    event = _parse_vevent(component)
                    if event:
                        events.append(event)

            print(f"Parsed {len(events)} events from iCal URL")
    except httpx.HTTPStatusError as e:
        print(f"HTTP error {e.response.status_code} when fetching iCal from URL: {url[:80]}...")
        print(f"Response: {e.response.text[:200]}")
        raise
    except Exception as e:
        print(f"Error parsing iCal from URL {url[:80]}...: {e}")
        import traceback

        traceback.print_exc()
        raise

    return events


def _parse_vevent(component) -> CalendarEvent | None:
    """
    Parse a VEVENT component into a CalendarEvent.

    Args:
        component: iCalendar VEVENT component

    Returns:
        CalendarEvent or None if parsing fails
    """
    try:
        # Extract event data
        uid = str(component.get("UID", ""))
        summary = str(component.get("SUMMARY", "No Title"))
        description = str(component.get("DESCRIPTION", ""))
        location = str(component.get("LOCATION", ""))

        # Parse dates
        dtstart = component.get("DTSTART")
        dtend = component.get("DTEND")

        if not dtstart or not dtend:
            return None

        # Handle both datetime and date-only
        start_dt = dtstart.dt
        end_dt = dtend.dt

        if isinstance(start_dt, datetime):
            # Keep timezone-aware datetimes as-is (for proper timezone handling)
            # If naive, assume UTC
            if start_dt.tzinfo is None:
                start = start_dt.replace(tzinfo=UTC)
            else:
                start = start_dt
        else:
            # Date-only (all-day event) - use UTC midnight
            start = datetime.combine(start_dt, datetime.min.time(), tzinfo=UTC)

        if isinstance(end_dt, datetime):
            # Keep timezone-aware datetimes as-is (for proper timezone handling)
            # If naive, assume UTC
            if end_dt.tzinfo is None:
                end = end_dt.replace(tzinfo=UTC)
            else:
                end = end_dt
        else:
            # Date-only (all-day event)
            # IMPORTANT: In iCal RFC 5545, DTEND for all-day events is EXCLUSIVE (the day after the event ends)
            # So if DTEND is 2024-01-04, the event actually ends on 2024-01-03 (inclusive)
            # Example: A 3-day event Jan 1-3 has DTSTART=2024-01-01, DTEND=2024-01-04
            # We need to subtract one day to get the actual last day of the event
            from datetime import timedelta

            actual_end_date = end_dt - timedelta(days=1)
            # Use end of the actual last day (23:59:59.999999) to represent the full day
            # When we extract calendar date in frontend, this will correctly be Jan 3
            end = datetime.combine(actual_end_date, datetime.max.time(), tzinfo=UTC)

        # Check if all-day event
        all_day = not isinstance(dtstart.dt, datetime)

        # Get color if available
        color = None
        if hasattr(component, "get"):
            color_prop = component.get("COLOR")
            if color_prop:
                color = str(color_prop)

        event = CalendarEvent(
            id=uid,
            title=summary,
            start=start,
            end=end,
            description=description if description else None,
            location=location if location else None,
            source="google",  # Assume Google Calendar for now
            color=color,
            all_day=all_day,
        )

        return event
    except Exception as e:
        print(f"Error parsing VEVENT: {e}")
        return None


async def parse_ical_from_file(file_path: str) -> list[CalendarEvent]:
    """
    Parse iCal/ICS file from local file path.

    Args:
        file_path: Path to the iCal/ICS file

    Returns:
        List of calendar events
    """
    events: list[CalendarEvent] = []

    try:
        with open(file_path, "rb") as f:
            calendar = Calendar.from_ical(f.read())

            for component in calendar.walk():
                if component.name == "VEVENT":
                    event = _parse_vevent(component)
                    if event:
                        events.append(event)
    except Exception as e:
        print(f"Error parsing iCal from file {file_path}: {e}")
        raise

    return events
