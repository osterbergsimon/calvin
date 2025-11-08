"""Google Calendar utility functions."""

import re
from urllib.parse import quote


def convert_share_url_to_ical(share_url: str) -> str | None:
    """
    Convert Google Calendar share URL to iCal feed URL.

    Args:
        share_url: Google Calendar share URL
            Example: https://calendar.google.com/calendar/u/0?cid=...

    Returns:
        iCal feed URL or None if conversion fails
    """
    # Extract calendar ID from share URL
    # Pattern: https://calendar.google.com/calendar/u/0?cid=EMAIL@group.calendar.google.com
    cid_match = re.search(r"[?&]cid=([^&]+)", share_url)
    if not cid_match:
        return None

    calendar_id = cid_match.group(1)

    # URL encode the calendar ID properly
    # Use quote with safe='' to encode all special characters
    calendar_id_encoded = quote(calendar_id, safe="")

    # Convert to iCal feed URL
    # Format: https://calendar.google.com/calendar/ical/CALENDAR_ID/basic.ics
    ical_url = f"https://calendar.google.com/calendar/ical/{calendar_id_encoded}/basic.ics"

    return ical_url


def is_google_calendar_url(url: str) -> bool:
    """
    Check if URL is a Google Calendar URL.

    Args:
        url: URL to check

    Returns:
        True if it's a Google Calendar URL
    """
    return "calendar.google.com" in url


def normalize_google_calendar_url(url: str) -> str:
    """
    Normalize Google Calendar URL to iCal format.

    If it's already an iCal URL (including private URLs with tokens), return as-is.
    If it's a share URL, convert to iCal.

    Args:
        url: Google Calendar URL (share or iCal, including private URLs)

    Returns:
        iCal feed URL
    """
    # If already an iCal URL (ends with .ics or has /ical/ in path), return as-is
    # This includes private URLs like: /ical/.../private-.../basic.ics
    if url.endswith(".ics") or "/ical/" in url:
        return url

    # If it's a share URL, convert it
    if is_google_calendar_url(url):
        ical_url = convert_share_url_to_ical(url)
        if ical_url:
            return ical_url

    # If we can't convert, return original (might be a different format or already correct)
    return url
