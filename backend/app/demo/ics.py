"""Generate a rich sample iCal feed anchored to today.

Shared by ``python -m app.demo seed`` (CLV-67) and
``scripts/seed_test_calendar.py``. The events are deterministic for a given
day: timed, all-day, multi-day, midnight-crossing and an overflow day, spread
over several weeks so month / week / day / rolling calendar views all show
content.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta


def _fold(line: str) -> str:
    """iCal lines must be <=75 octets; naive fold is plenty for our short text."""
    return line


def _timed(uid: str, summary: str, start: datetime, end: datetime, **extra: str) -> list[str]:
    lines = [
        "BEGIN:VEVENT",
        f"UID:{uid}",
        f"DTSTART:{start.strftime('%Y%m%dT%H%M%SZ')}",
        f"DTEND:{end.strftime('%Y%m%dT%H%M%SZ')}",
        f"SUMMARY:{summary}",
    ]
    for key, value in extra.items():
        if value:
            lines.append(f"{key.upper()}:{value}")
    lines.append("END:VEVENT")
    return [_fold(line) for line in lines]


def _all_day(uid: str, summary: str, start: date, days: int = 1, **extra: str) -> list[str]:
    # DTEND is exclusive in RFC 5545 → add one day past the last day.
    end = start + timedelta(days=days)
    lines = [
        "BEGIN:VEVENT",
        f"UID:{uid}",
        f"DTSTART;VALUE=DATE:{start.strftime('%Y%m%d')}",
        f"DTEND;VALUE=DATE:{end.strftime('%Y%m%d')}",
        f"SUMMARY:{summary}",
    ]
    for key, value in extra.items():
        if value:
            lines.append(f"{key.upper()}:{value}")
    lines.append("END:VEVENT")
    return [_fold(line) for line in lines]


def build_ics(weeks_back: int = 2, weeks_forward: int = 8, today: date | None = None) -> str:
    """Return an iCal document with events around ``today`` (default: today)."""
    today = today or date.today()
    at = lambda d, h, m=0: datetime(d.year, d.month, d.day, h, m)  # noqa: E731

    body: list[str] = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Calvin//Sample Calendar//EN",
        "CALSCALE:GREGORIAN",
        "X-WR-CALNAME:Calvin Sample Events",
    ]

    start_day = today - timedelta(days=weeks_back * 7)
    end_day = today + timedelta(days=weeks_forward * 7)

    # Recurring-ish weekday/weekly events so every week has something to show.
    day = start_day
    while day <= end_day:
        wd = day.weekday()  # Mon=0 .. Sun=6
        stamp = day.strftime("%Y%m%d")
        if wd < 5:  # weekdays
            body += _timed(
                f"standup-{stamp}@calvin.test",
                "Daily standup",
                at(day, 9, 0),
                at(day, 9, 15),
                location="Zoom",
            )
        if wd == 0:  # Monday
            body += _timed(
                f"teamsync-{stamp}@calvin.test",
                "Team sync",
                at(day, 13, 0),
                at(day, 14, 0),
                location="Room A",
                description="Weekly planning and demos.",
            )
        if wd == 2:  # Wednesday
            body += _timed(
                f"one-on-one-{stamp}@calvin.test",
                "1:1 with manager",
                at(day, 15, 0),
                at(day, 15, 30),
            )
        if wd == 4:  # Friday
            body += _timed(
                f"gym-{stamp}@calvin.test",
                "Gym session",
                at(day, 17, 30),
                at(day, 18, 30),
                location="Fitness Center",
            )
        if wd == 5:  # Saturday
            body += _timed(
                f"brunch-{stamp}@calvin.test",
                "Weekend brunch",
                at(day, 11, 0),
                at(day, 12, 30),
                location="Cafe Nord",
            )
        day += timedelta(days=1)

    # Overflow day (today): pile on extra events to exercise the "+N more" chip.
    ts = today.strftime("%Y%m%d")
    body += _timed(
        f"dentist-{ts}@calvin.test",
        "Dentist",
        at(today, 10, 0),
        at(today, 10, 45),
        location="Dental Clinic",
    )
    body += _timed(
        f"lunch-{ts}@calvin.test",
        "Lunch with Sam",
        at(today, 12, 0),
        at(today, 13, 0),
        location="Sushi Place",
    )
    body += _timed(
        f"review-{ts}@calvin.test",
        "Design review",
        at(today, 14, 0),
        at(today, 15, 0),
        description="Go over the calendar redesign.",
    )
    body += _timed(f"callmom-{ts}@calvin.test", "Call mom", at(today, 19, 0), at(today, 19, 30))

    # All-day and multi-day events across month boundaries.
    body += _all_day(
        f"conf-{ts}@calvin.test",
        "Conference (Berlin)",
        today + timedelta(days=3),
        days=3,
        location="Berlin",
    )
    body += _all_day(
        f"holiday-{ts}@calvin.test", "Public holiday", today + timedelta(days=10), days=1
    )
    body += _all_day(
        f"vacation-{ts}@calvin.test",
        "Vacation 🏖️",
        today + timedelta(days=20),
        days=8,
        description="Out of office.",
    )
    body += _all_day(
        f"launch-{ts}@calvin.test", "Product launch day", today + timedelta(days=14), days=1
    )

    # A timed event that crosses midnight (start day → next day).
    flight_day = today + timedelta(days=7)
    body += _timed(
        f"flight-{ts}@calvin.test",
        "Overnight flight to NYC",
        at(flight_day, 22, 0),
        at(flight_day + timedelta(days=1), 6, 0),
        location="Airport",
    )

    body.append("END:VCALENDAR")
    return "\r\n".join(body) + "\r\n"
