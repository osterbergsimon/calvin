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
import os
import sys
import urllib.error
import urllib.request
from functools import partial
from http.cookiejar import CookieJar
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

# The generator lives with the backend so `python -m app.demo seed` and this
# script produce the same calendar (CLV-67).
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app.demo.ics import build_ics  # noqa: E402

ICS_FILENAME = "calvin-test-events.ics"
SOURCE_ID = "test-events"
SOURCE_NAME = "Test Events (seed)"
SOURCE_COLOR = "#4f9dff"


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
def _request(
    opener: urllib.request.OpenerDirector, method: str, url: str, payload: dict | None
) -> tuple[int, str]:
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with opener.open(req, timeout=15) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()
    except urllib.error.URLError as e:
        return 0, str(e)


def login(api: str, password: str, opener: urllib.request.OpenerDirector) -> bool:
    """Log in with CALVIN_ADMIN_PASSWORD; the cookie jar carries the session."""
    status, text = _request(opener, "POST", f"{api}/api/auth/login", {"password": password})
    if status == 200:
        print("✓ Logged in as admin (CALVIN_ADMIN_PASSWORD).")
        return True
    if status == 401 and "setup_required" in text:
        print("✗ No admin password is configured yet. Open Settings in Calvin and choose one,")
        print("  or start Calvin with CALVIN_ADMIN_PASSWORD set.")
    else:
        print(f"✗ Admin login failed ({status}): {text[:200]}")
    return False


def register_source(api: str, ics_url: str, opener: urllib.request.OpenerDirector) -> bool:
    payload = {
        "id": SOURCE_ID,
        "type": "ical",
        "name": SOURCE_NAME,
        "enabled": True,
        "ical_url": ics_url,
        "color": SOURCE_COLOR,
        "show_time": True,
    }
    status, text = _request(opener, "POST", f"{api}/api/calendar/sources", payload)
    if status in (200, 201):
        print(f"✓ Registered calendar source '{SOURCE_ID}'.")
        return True
    # Already exists (or add rejected) → try updating in place.
    status_put, text_put = _request(
        opener, "PUT", f"{api}/api/calendar/sources/{SOURCE_ID}", payload
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
    parser.add_argument(
        "--api",
        default="http://localhost:8000",
        help="Calvin backend base URL (default: http://localhost:8000)",
    )
    parser.add_argument(
        "--host",
        default="localhost",
        help="Hostname the backend uses to reach this server (default: localhost)",
    )
    parser.add_argument(
        "--port", type=int, default=8899, help="Port to serve the .ics on (default: 8899)"
    )
    parser.add_argument(
        "--weeks-back", type=int, default=2, help="Weeks of history to generate (default: 2)"
    )
    parser.add_argument(
        "--weeks-forward", type=int, default=8, help="Weeks ahead to generate (default: 8)"
    )
    parser.add_argument(
        "--no-register", action="store_true", help="Only generate + serve; skip API registration"
    )
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
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))
        password = os.environ.get("CALVIN_ADMIN_PASSWORD", "")
        if password:
            if not login(args.api, password, opener):
                return 1
        else:
            print(
                "! CALVIN_ADMIN_PASSWORD is not set — registering a source needs an admin session."
            )
            print("  Set it to Calvin's admin password and re-run this script.")
        register_source(args.api, ics_url, opener)
        # Nudge the backend to fetch fresh data now.
        _request(opener, "POST", f"{args.api}/api/calendar/refresh", None)

    print("\nLeave this running while you test the calendar. Press Ctrl+C to stop.")
    print(
        "Remove the source later from Settings, or with an admin session: "
        f"DELETE {args.api}/api/calendar/sources/{SOURCE_ID}"
    )
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
