#!/usr/bin/env python3
"""Seed Calvin with a rich test calendar so the calendar views can be tried out.

Calvin only sources events from calendar plugins that fetch an iCal URL over
HTTP, so this script:

  1. Generates an .ics with a variety of events anchored to *today* (timed,
     all-day, multi-day, midnight-crossing, plus an overflow day) spread across
     several weeks so month / week / day / rolling views all show content.
  2. Serves that .ics over HTTP (so the backend can fetch and re-fetch it).
  3. Registers (or updates) it as an "ical" calendar source via the Calvin API.

Then it keeps serving until you press Ctrl+C. Leave it running while you poke at
the calendar; re-run it any time. Remove the source with:

    curl -X DELETE http://localhost:8000/api/calendar/sources/test-events

Usage:
    python scripts/seed_test_calendar.py
    python scripts/seed_test_calendar.py --api http://localhost:8000 --port 8899
    python scripts/seed_test_calendar.py --weeks-back 2 --weeks-forward 8
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ICS_FILENAME = "calvin-test-events.ics"
SOURCE_ID = "test-events"
SOURCE_NAME = "Test Events (seed)"
SOURCE_COLOR = "#4f9dff"


# ── iCal generation ─────────────────────────────────────────────────────────
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


def build_ics(weeks_back: int, weeks_forward: int) -> str:
    today = date.today()
    at = lambda d, h, m=0: datetime(d.year, d.month, d.day, h, m)  # noqa: E731

    body: list[str] = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Calvin//Test Calendar//EN",
        "CALSCALE:GREGORIAN",
        "X-WR-CALNAME:Calvin Test Events",
    ]

    start_day = today - timedelta(days=weeks_back * 7)
    end_day = today + timedelta(days=weeks_forward * 7)

    # Recurring-ish weekday/weekly events so every week has something to show.
    day = start_day
    n = 0
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
        n += 1

    # Overflow day (today): pile on extra events to exercise the "+N more" chip.
    ts = today.strftime("%Y%m%d")
    body += _timed(f"dentist-{ts}@calvin.test", "Dentist", at(today, 10, 0), at(today, 10, 45),
                   location="Dental Clinic")
    body += _timed(f"lunch-{ts}@calvin.test", "Lunch with Sam", at(today, 12, 0),
                   at(today, 13, 0), location="Sushi Place")
    body += _timed(f"review-{ts}@calvin.test", "Design review", at(today, 14, 0),
                   at(today, 15, 0), description="Go over the calendar redesign.")
    body += _timed(f"callmom-{ts}@calvin.test", "Call mom", at(today, 19, 0), at(today, 19, 30))

    # All-day and multi-day events across month boundaries.
    body += _all_day(f"conf-{ts}@calvin.test", "Conference (Berlin)", today + timedelta(days=3),
                     days=3, location="Berlin")
    body += _all_day(f"holiday-{ts}@calvin.test", "Public holiday", today + timedelta(days=10),
                     days=1)
    body += _all_day(f"vacation-{ts}@calvin.test", "Vacation 🏖️", today + timedelta(days=20),
                     days=8, description="Out of office.")
    body += _all_day(f"launch-{ts}@calvin.test", "Product launch day", today + timedelta(days=14),
                     days=1)

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


# ── HTTP serving ────────────────────────────────────────────────────────────
class _QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):  # noqa: D401 - silence per-request noise
        pass

    def end_headers(self):
        if self.path.endswith(".ics"):
            self.send_header("Content-Type", "text/calendar; charset=utf-8")
        super().end_headers()


def start_server(directory: Path, port: int) -> ThreadingHTTPServer:
    handler = partial(_QuietHandler, directory=str(directory))
    httpd = ThreadingHTTPServer(("0.0.0.0", port), handler)
    import threading

    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


# ── API registration ────────────────────────────────────────────────────────
def _request(method: str, url: str, payload: dict | None) -> tuple[int, str]:
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()
    except urllib.error.URLError as e:
        return 0, str(e)


def register_source(api: str, ics_url: str) -> bool:
    payload = {
        "id": SOURCE_ID,
        "type": "ical",
        "name": SOURCE_NAME,
        "enabled": True,
        "ical_url": ics_url,
        "color": SOURCE_COLOR,
        "show_time": True,
    }
    status, text = _request("POST", f"{api}/api/calendar/sources", payload)
    if status in (200, 201):
        print(f"✓ Registered calendar source '{SOURCE_ID}'.")
        return True
    # Already exists (or add rejected) → try updating in place.
    status_put, text_put = _request(
        "PUT", f"{api}/api/calendar/sources/{SOURCE_ID}", payload
    )
    if status_put == 200:
        print(f"✓ Updated existing calendar source '{SOURCE_ID}'.")
        return True
    print("✗ Could not register the calendar source.")
    print(f"  POST -> {status}: {text[:200]}")
    print(f"  PUT  -> {status_put}: {text_put[:200]}")
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api", default="http://localhost:8000",
                        help="Calvin backend base URL (default: http://localhost:8000)")
    parser.add_argument("--host", default="localhost",
                        help="Hostname the backend uses to reach this server (default: localhost)")
    parser.add_argument("--port", type=int, default=8899,
                        help="Port to serve the .ics on (default: 8899)")
    parser.add_argument("--weeks-back", type=int, default=2,
                        help="Weeks of history to generate (default: 2)")
    parser.add_argument("--weeks-forward", type=int, default=8,
                        help="Weeks ahead to generate (default: 8)")
    parser.add_argument("--no-register", action="store_true",
                        help="Only generate + serve; skip API registration")
    args = parser.parse_args()

    out_dir = Path(__file__).resolve().parent / "_test_calendar"
    out_dir.mkdir(exist_ok=True)
    ics_path = out_dir / ICS_FILENAME
    ics_path.write_text(build_ics(args.weeks_back, args.weeks_forward), encoding="utf-8")
    event_count = ics_path.read_text(encoding="utf-8").count("BEGIN:VEVENT")
    print(f"✓ Generated {event_count} test events → {ics_path}")

    httpd = start_server(out_dir, args.port)
    ics_url = f"http://{args.host}:{args.port}/{ICS_FILENAME}"
    print(f"✓ Serving iCal at {ics_url}")

    if not args.no_register:
        register_source(args.api, ics_url)
        # Nudge the backend to fetch fresh data now.
        _request("POST", f"{args.api}/api/calendar/refresh", None)

    print("\nLeave this running while you test the calendar. Press Ctrl+C to stop.")
    print(f"Remove the source later: curl -X DELETE {args.api}/api/calendar/sources/{SOURCE_ID}")
    try:
        import time

        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        print("\nStopping server.")
        httpd.shutdown()
    return 0


if __name__ == "__main__":
    sys.exit(main())
