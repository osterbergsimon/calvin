"""Sample-data command for demos and screenshots (CLV-67).

    uv run python -m app.demo seed [--data-dir DIR] [--calendar-url URL] [--json]
    uv run python -m app.demo clear [--data-dir DIR] [--json]

``seed`` adds a sample calendar, twelve bundled CC0 photos, two dashboard
pages and a room name. ``clear`` removes exactly those and nothing the user
created. Both operate on the configured data directory (``CALVIN_DATA_DIR``
or ``backend/data``).

A running backend loads plugin instances at startup, so restart Calvin after
seeding (or run this before the first start) to see the sample calendar.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m app.demo")
    sub = parser.add_subparsers(dest="command", required=True)

    seed = sub.add_parser("seed", help="add the sample calendar, photos, pages and room name")
    seed.add_argument(
        "--data-dir",
        type=Path,
        help="Calvin data directory (default: CALVIN_DATA_DIR or backend/data)",
    )
    seed.add_argument(
        "--calendar-url",
        help=(
            "URL the backend fetches the sample .ics from "
            "(default: http://127.0.0.1:<API_PORT>/api/demo/calendar.ics)"
        ),
    )

    clear = sub.add_parser("clear", help="remove only the sample items this command created")
    clear.add_argument(
        "--data-dir",
        type=Path,
        help="Calvin data directory (default: CALVIN_DATA_DIR or backend/data)",
    )

    for command in (seed, clear):
        command.add_argument("--json", action="store_true", help="print the result as JSON")
    return parser


async def _boot() -> None:
    """Open the DB and load plugins the way the server's startup does."""
    from app.database import connect_db
    from app.main import _initialize_database, _initialize_plugins

    await connect_db()
    await _initialize_database()
    await _initialize_plugins()


async def _shutdown() -> None:
    from app.database import disconnect_db
    from app.plugins.manager import plugin_manager

    await plugin_manager.cleanup_all()
    await disconnect_db()


async def _run(args: argparse.Namespace) -> int:
    from app.config import settings
    from app.demo.seed import (
        DemoSeedError,
        clear_demo,
        default_calendar_url,
        seed_demo,
    )

    await _boot()
    try:
        if args.command == "seed":
            calendar_url = args.calendar_url or default_calendar_url(settings.api_port)
            result = await seed_demo(
                data_dir=settings.data_dir,
                image_dir=settings.image_dir,
                calendar_url=calendar_url,
            )
        else:
            result = await clear_demo(
                data_dir=settings.data_dir,
                image_dir=settings.image_dir,
            )
    except DemoSeedError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    finally:
        await _shutdown()

    if args.json:
        print(json.dumps(result, indent=2, default=str))
        return 0

    if args.command == "seed":
        print(f"Sample data seeded in {settings.data_dir}")
        print(f"  calendar: {result['events']} events -> {result['calendar']['url']}")
        print(f"  photos:   {result['photos']['count']} CC0 sample photos")
        if result["pages"].get("created"):
            print(f"  pages:    {', '.join(result['pages']['screens'])}")
            if result["pages"].get("room_name"):
                print(f"  room:     {result['pages']['room_name']}")
        else:
            print(f"  pages:    left alone ({result['pages'].get('reason')})")
        print("Restart Calvin (or start it) so the backend loads the sample calendar.")
    else:
        if not result.get("removed"):
            print(f"Nothing to clear: {result.get('reason')}")
        else:
            print("Sample data cleared")
            print(f"  calendar: {'removed' if result['calendar'] else 'not present'}")
            print(f"  photos:   {len(result['photos'])} removed")
            print(f"  pages:    {'removed' if result['pages'] else 'not present'}")
        print("Restart Calvin so the backend drops the sample calendar.")
    return 0


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if getattr(args, "data_dir", None):
        # Must be set before app.config builds the global settings object.
        os.environ["CALVIN_DATA_DIR"] = str(args.data_dir)
    return asyncio.run(_run(args))


if __name__ == "__main__":
    sys.exit(main())
