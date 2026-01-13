"""iCal/ICS file parser for Google Calendar share links."""

from datetime import UTC, datetime

import httpx
from icalendar import Calendar
from loguru import logger

from app.models.calendar import CalendarEvent

# Loguru automatically includes module/function info in logs via format string


async def parse_ical_from_url(url: str) -> list[CalendarEvent]:
    """
    Parse iCal/ICS file from a URL (e.g., Google Calendar share link).

    Args:
        url: URL to the iCal/ICS file

    Returns:
        List of calendar events
    """
    events: list[CalendarEvent] = []

    logger.debug("Fetching iCal from URL: {}...", url[:100])

    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            logger.debug("Making HTTP GET request to: {}...", url[:100])
            response = await client.get(url)
            logger.debug(
                "HTTP response: status={}, content-type={}, content-length={} bytes",
                response.status_code,
                response.headers.get("content-type", "unknown"),
                len(response.content),
            )
            response.raise_for_status()

            # Check if we got valid iCal content
            content_type = response.headers.get("content-type", "").lower()
            if "text/calendar" not in content_type and "text/plain" not in content_type:
                logger.warning(
                    "Unexpected content type {} for iCal URL: {}...",
                    content_type,
                    url[:100],
                )

            # Parse iCal content
            calendar = Calendar.from_ical(response.content)

            for component in calendar.walk():
                if component.name == "VEVENT":
                    event = _parse_vevent(component)
                    if event:
                        events.append(event)

            logger.debug("Parsed {} events from iCal URL: {}...", len(events), url[:100])
            if events:
                logger.debug(
                    "Event date range: earliest={}, latest={}",
                    min((e.start for e in events), default="N/A"),
                    max((e.end for e in events), default="N/A"),
                )
    except httpx.HTTPStatusError as e:
        logger.error(
            "HTTP error {} when fetching iCal from URL: {}... Response: {}",
            e.response.status_code,
            url[:100],
            e.response.text[:200],
        )
        raise
    except Exception:
        logger.exception("Error parsing iCal from URL {}...", url[:100])
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
            # IMPORTANT: In iCal RFC 5545, DTEND for all-day events is EXCLUSIVE
            # (the day after the event ends)
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
        logger.debug("Error parsing VEVENT: {}", e)
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
    except Exception:
        logger.exception("Error parsing iCal from file {}", file_path)
        raise

    return events
