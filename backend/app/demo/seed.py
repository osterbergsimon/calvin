"""Seed and clear realistic sample content for demos (CLV-67).

``python -m app.demo seed`` adds a sample calendar, twelve bundled CC0 photos,
two dashboard pages and a room name, all clearly marked as demo content.
``clear`` removes exactly what the seed created and leaves everything the user
made untouched.

The marker is twofold: namespaced ids/names (``demo-calendar``,
``calvin-demo-*.jpg``, ``demo-screen-*``) plus a manifest in
``<data_dir>/demo/manifest.json`` recording every item that was created. Clear
trusts the manifest, so a user item can never be swept up by a prefix match
alone.

Writes go through the existing services: plugin instances via the instance
manager, config via ``config_service`` (both retry on SQLite locks).
"""

from __future__ import annotations

import hashlib
import json
import shutil
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

from loguru import logger

from app.demo.ics import build_ics

DEMO_DIRNAME = "demo"
MANIFEST_NAME = "manifest.json"
CALENDAR_ICS_NAME = "sample-calendar.ics"

CALENDAR_SOURCE_ID = "demo-calendar"
CALENDAR_SOURCE_NAME = "Sample calendar (demo)"
CALENDAR_SOURCE_COLOR = "#4f9dff"

PHOTO_PREFIX = "calvin-demo-"
PHOTO_ASSETS_DIR = Path(__file__).resolve().parent / "assets" / "photos"

SCREEN_CALENDAR_ID = "demo-screen-calendar"
SCREEN_PHOTO_ID = "demo-screen-photo-frame"
DEMO_SCREEN_IDS = (SCREEN_CALENDAR_ID, SCREEN_PHOTO_ID)
DEMO_ROOM_NAME = "Demo Room"

MANIFEST_VERSION = 1


class DemoSeedError(RuntimeError):
    """Raised when seeding cannot proceed safely."""


# ── paths ───────────────────────────────────────────────────────────────────
def demo_dir(data_dir: Path) -> Path:
    """Directory holding every file the demo command writes."""
    return Path(data_dir) / DEMO_DIRNAME


def calendar_ics_path(data_dir: Path) -> Path:
    """The .ics the backend serves at ``/api/demo/calendar.ics``."""
    return demo_dir(data_dir) / CALENDAR_ICS_NAME


def manifest_path(data_dir: Path) -> Path:
    """Where the demo manifest lives."""
    return demo_dir(data_dir) / MANIFEST_NAME


def default_calendar_url(api_port: int) -> str:
    """URL the ical plugin uses to fetch the demo feed from this backend.

    Loopback reaches the backend itself both natively and inside the Docker
    container, so no extra HTTP server is needed.
    """
    return f"http://127.0.0.1:{api_port}/api/demo/calendar.ics"


def bundled_photos() -> list[Path]:
    """The CC0 sample photos shipped with the backend, in stable order."""
    return sorted(PHOTO_ASSETS_DIR.glob(f"{PHOTO_PREFIX}*.jpg"))


# ── manifest ────────────────────────────────────────────────────────────────
def read_manifest(data_dir: Path) -> dict[str, Any] | None:
    """Return the demo manifest, or None when nothing was seeded."""
    path = manifest_path(data_dir)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("Ignoring unreadable demo manifest {}: {}", path, exc)
        return None
    return data if isinstance(data, dict) else None


def _write_manifest(data_dir: Path, manifest: dict[str, Any]) -> None:
    path = manifest_path(data_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _new_manifest() -> dict[str, Any]:
    return {
        "version": MANIFEST_VERSION,
        "created_at": datetime.now(UTC).isoformat(),
        "calendar_source_ids": [],
        "photos": [],
        "screens": [],
        "config": {},
    }


def _merge(existing: list[str], new: list[str]) -> list[str]:
    """Union preserving order: items removed from a later bundle stay listed.

    Clear must still be able to remove a file seeded by an older release.
    """
    return list(dict.fromkeys([*existing, *new]))


# ── pages / room ────────────────────────────────────────────────────────────
def _demo_screens() -> list[dict[str, Any]]:
    return [
        {
            "id": SCREEN_CALENDAR_ID,
            "name": "Sample: calendar + photos",
            "demo": True,
            "layout": {
                "version": 1,
                "preset": "split_two",
                "regions": [
                    {"id": "region-1", "kind": "calendar", "serviceId": None, "size": 70},
                    {"id": "region-2", "kind": "photos", "serviceId": None, "size": 30},
                ],
            },
            "activeRegionId": "region-1",
        },
        {
            "id": SCREEN_PHOTO_ID,
            "name": "Sample: photo frame",
            "demo": True,
            "layout": {
                "version": 1,
                "preset": "single",
                "regions": [
                    {"id": "region-1", "kind": "photos", "serviceId": None, "size": 100},
                ],
            },
            "activeRegionId": "region-1",
        },
    ]


def _is_demo_screen(screen: dict[str, Any]) -> bool:
    """True only for the two screens this command creates.

    The id, not the ``demo`` flag, decides: duplicating a page in Settings
    copies the flag to a new id, and that copy is the user's, not ours.
    """
    return screen.get("id") in DEMO_SCREEN_IDS


async def _seed_pages(manifest: dict[str, Any]) -> dict[str, Any]:
    from app.services.config_service import config_service

    screens_config = await config_service.get_value("dashboard_screens") or {}
    screens = list(screens_config.get("screens") or [])
    user_screens = [screen for screen in screens if not _is_demo_screen(screen)]

    if user_screens:
        return {"created": False, "reason": "the user already has pages"}

    # First seed that touches pages: remember that the key was ours to remove.
    # Nothing user-made is in this list (we returned above otherwise), so clear
    # can drop the key and let Calvin's built-in default apply.
    if "dashboard_screens" not in manifest["config"]:
        manifest["config"]["dashboard_screens"] = {"previous": None}

    active = screens_config.get("activeScreenId")
    if active not in DEMO_SCREEN_IDS:
        active = SCREEN_CALENDAR_ID
    demo_screens = _demo_screens()
    await config_service.set_value(
        "dashboard_screens",
        {"version": 2, "activeScreenId": active, "screens": demo_screens},
    )
    manifest["screens"] = _merge(manifest["screens"], [s["id"] for s in demo_screens])

    room = await config_service.get_value("displayName")
    room_created = False
    if not room:
        if "displayName" not in manifest["config"]:
            manifest["config"]["displayName"] = {"previous": room}
        await config_service.set_value("displayName", DEMO_ROOM_NAME)
        room_created = True

    return {
        "created": True,
        "screens": [s["id"] for s in demo_screens],
        "room_name": DEMO_ROOM_NAME if room_created else None,
    }


# ── photos ──────────────────────────────────────────────────────────────────
def _seed_photos(image_dir: Path, manifest: dict[str, Any]) -> dict[str, Any]:
    image_dir = Path(image_dir)
    image_dir.mkdir(parents=True, exist_ok=True)
    copied: list[str] = []
    skipped: list[str] = []
    for source in bundled_photos():
        destination = image_dir / source.name
        # Only overwrite a file we recorded as ours on an earlier seed. A user
        # file that happens to share the name is left alone and reported.
        if destination.exists() and source.name not in manifest["photos"]:
            skipped.append(source.name)
            continue
        shutil.copyfile(source, destination)
        copied.append(source.name)

    manifest["photos"] = _merge(manifest["photos"], copied)
    return {"count": len(copied), "files": copied, "skipped": skipped}


def _thumbnail_path(image_dir: Path, filename: str) -> Path:
    """The local image plugin's thumbnail name for one source file."""
    image_id = hashlib.md5(
        str(Path(image_dir) / filename).encode(), usedforsecurity=False
    ).hexdigest()
    return Path(image_dir) / "thumbnails" / f"{image_id}.jpg"


# ── calendar source ─────────────────────────────────────────────────────────
async def _seed_calendar(calendar_url: str, manifest: dict[str, Any]) -> dict[str, Any]:
    from app.models.db_models import PluginDB, PluginTypeDB
    from app.plugins.utils.instance_manager import apply_plugin_config_update

    existing = await PluginDB.objects.get_or_none(id=CALENDAR_SOURCE_ID)
    if existing is not None and (existing.config or {}).get("demo") is not True:
        # Something the user owns already uses our id: never overwrite it.
        return {
            "created": False,
            "reason": f"a calendar source with id {CALENDAR_SOURCE_ID!r} already exists",
        }

    db_type = await PluginTypeDB.objects.get_or_none(type_id="ical")
    if db_type is None:
        raise DemoSeedError(
            "The iCal plugin type is not registered. Start Calvin once before seeding."
        )

    result = await apply_plugin_config_update(
        "ical",
        {
            "_instance_id": CALENDAR_SOURCE_ID,
            "_instance_name": CALENDAR_SOURCE_NAME,
            "_instance_enabled": True,
            "ical_url": calendar_url,
            "color": CALENDAR_SOURCE_COLOR,
            "show_time": True,
            "demo": True,
        },
        True,
        db_type,
    )
    if not result or result.get("error"):
        raise DemoSeedError(f"Could not create the demo calendar source: {result}")

    manifest["calendar_source_ids"] = _merge(manifest["calendar_source_ids"], [CALENDAR_SOURCE_ID])
    return {"id": CALENDAR_SOURCE_ID, "url": calendar_url}


# ── public API ──────────────────────────────────────────────────────────────
async def seed_demo(
    *,
    data_dir: Path,
    image_dir: Path,
    calendar_url: str,
    today: date | None = None,
) -> dict[str, Any]:
    """Add the sample content; safe to run repeatedly."""
    data_dir = Path(data_dir)
    manifest = read_manifest(data_dir) or _new_manifest()
    for key in ("calendar_source_ids", "photos", "screens"):
        manifest.setdefault(key, [])
    manifest.setdefault("config", {})

    ics_path = calendar_ics_path(data_dir)
    ics_path.parent.mkdir(parents=True, exist_ok=True)
    ics_path.write_text(build_ics(today=today), encoding="utf-8")
    event_count = ics_path.read_text(encoding="utf-8").count("BEGIN:VEVENT")

    try:
        calendar = await _seed_calendar(calendar_url, manifest)
        photos = _seed_photos(image_dir, manifest)
        pages = await _seed_pages(manifest)
    finally:
        # Record whatever succeeded so clear can remove it even after a failure.
        _write_manifest(data_dir, manifest)

    logger.info(
        "Demo seed complete: calendar={}, photos={}, pages={}",
        calendar.get("id") or calendar.get("reason"),
        photos["count"],
        pages.get("created"),
    )
    return {
        "calendar": calendar,
        "calendar_ics": str(ics_path),
        "events": event_count,
        "photos": photos,
        "pages": pages,
        "manifest": str(manifest_path(data_dir)),
    }


async def clear_demo(*, data_dir: Path, image_dir: Path) -> dict[str, Any]:
    """Remove exactly the items recorded in the demo manifest."""
    from app.models.db_models import PluginDB
    from app.plugins.registry import plugin_registry
    from app.services.config_service import config_service

    data_dir = Path(data_dir)
    image_dir = Path(image_dir)
    manifest = read_manifest(data_dir)
    if manifest is None:
        return {"removed": False, "reason": "no demo data is seeded"}

    removed: dict[str, Any] = {"removed": True, "calendar": False, "photos": [], "pages": False}

    for source_id in manifest.get("calendar_source_ids") or []:
        row = await PluginDB.objects.get_or_none(id=source_id)
        if row is not None and source_id == CALENDAR_SOURCE_ID:
            await plugin_registry.unregister_plugin(source_id)
            removed["calendar"] = True

    for filename in manifest.get("photos") or []:
        # Only our own flat, namespaced filenames — never a path.
        if Path(filename).name != filename or not filename.startswith(PHOTO_PREFIX):
            continue
        path = image_dir / filename
        if path.is_file():
            path.unlink()
            removed["photos"].append(filename)
        thumbnail = _thumbnail_path(image_dir, filename)
        if thumbnail.is_file():
            thumbnail.unlink()

    demo_ids = set(manifest.get("screens") or [])
    screens_config = await config_service.get_value("dashboard_screens")
    if demo_ids and screens_config:
        screens = list(screens_config.get("screens") or [])
        keep = [screen for screen in screens if screen.get("id") not in demo_ids]
        if len(keep) != len(screens):
            removed["pages"] = True
            if keep:
                updated = dict(screens_config)
                updated["screens"] = keep
                if updated.get("activeScreenId") in demo_ids:
                    updated["activeScreenId"] = keep[0]["id"]
                await config_service.set_value("dashboard_screens", updated)
            else:
                previous = (manifest.get("config") or {}).get("dashboard_screens") or {}
                if previous.get("previous"):
                    await config_service.set_value("dashboard_screens", previous["previous"])
                else:
                    await config_service.delete_value("dashboard_screens")

    room_entry = (manifest.get("config") or {}).get("displayName")
    if room_entry is not None:
        current = await config_service.get_value("displayName")
        if current == DEMO_ROOM_NAME:
            previous_room = room_entry.get("previous")
            if previous_room:
                await config_service.set_value("displayName", previous_room)
            else:
                await config_service.delete_value("displayName")
            removed["room_name"] = True

    for path in (calendar_ics_path(data_dir), manifest_path(data_dir)):
        path.unlink(missing_ok=True)
    try:
        demo_dir(data_dir).rmdir()
    except OSError:
        # Something the user put there keeps the directory; leave it alone.
        pass
    logger.info(
        "Demo clear complete: calendar={}, photos={}, pages={}",
        removed["calendar"],
        len(removed["photos"]),
        removed["pages"],
    )
    return removed
