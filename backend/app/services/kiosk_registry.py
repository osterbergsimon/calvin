"""Registry of known kiosks (per-device settings model — calvin-dd9.2)."""

import hashlib
import json
import re
import sqlite3
from datetime import UTC, datetime

from loguru import logger
from sqlalchemy.exc import IntegrityError as SAIntegrityError

from app.models.db_models import KioskDB
from app.utils.db_retry import retry_on_db_locked

# Shape allowlist for kiosk ids. Covers the default `<hostname>-<6hex>` ids and
# friendly operator-chosen names like `kitchen`. Anything else (whitespace,
# path separators, control chars, URL-encoded junk) is rejected before any DB
# write to bound growth and neutralise garbage/hostile input.
_KIOSK_ID_RE = re.compile(r"[A-Za-z0-9._-]{1,64}")

# Config keys a device-side agent physically applies (rotation, schedule, and
# reserved future backlight/output/mode). Used to compute a cheap per-kiosk
# version so the agent can detect device-physical changes without diffing full
# config. Extend this as dd9.1 follow-ups (brightness/output) land.
DEVICE_PHYSICAL_KEYS: tuple[str, ...] = (
    "orientation",
    "orientationFlipped",
    "applyDisplayRotation",
    "displayScheduleEnabled",
    "displaySchedule",
    "displayBrightness",
    "displayOutput",
    "displayResolution",
)

# Ormar/`databases` surface the raw sqlite3 error on a PK/UNIQUE conflict; other
# backends may raise the SQLAlchemy wrapper. Catch both so the create-race
# fallthrough works regardless of the underlying driver.
_INTEGRITY_ERRORS = (sqlite3.IntegrityError, SAIntegrityError)

_UPDATE_FLAG_KEY = "_agentUpdateRequested"  # stored in overrides; host-internal, not a device setting


def agent_update_requested(overrides: dict | None) -> bool:
    return bool((overrides or {}).get(_UPDATE_FLAG_KEY))


@retry_on_db_locked()
async def record_kiosk(
    kiosk_id: str,
    hostname: str | None = None,
    agent_version: str | None = None,
    agent_status: str | None = None,
) -> None:
    """Upsert a kiosk's registry row. No-op when kiosk_id is empty/None."""
    if not kiosk_id:
        return
    if not _KIOSK_ID_RE.fullmatch(kiosk_id):
        logger.warning(f"Ignoring malformed kiosk_id: {kiosk_id!r}")
        return
    if hostname is not None and len(hostname) > 255:
        hostname = hostname[:255]

    now = datetime.utcnow()
    existing = await KioskDB.objects.get_or_none(id=kiosk_id)
    if existing is None:
        try:
            await KioskDB.objects.create(
                id=kiosk_id, hostname=hostname, last_seen=now,
                agent_version=agent_version, agent_update_status=agent_status,
            )
            logger.info(f"Registered new kiosk: {kiosk_id!r} (hostname={hostname!r})")
            return
        except _INTEGRITY_ERRORS:
            existing = await KioskDB.objects.get_or_none(id=kiosk_id)
            if existing is None:
                return

    existing.last_seen = now
    if hostname:
        existing.hostname = hostname
    if agent_version is not None:
        existing.agent_version = agent_version
    if agent_status is not None:
        existing.agent_update_status = agent_status
    # Auto-clear the update flag once the agent confirms it runs the requested version.
    if agent_version is not None and existing.overrides:
        ov = dict(existing.overrides)
        if ov.pop(_UPDATE_FLAG_KEY, None) is not None:
            existing.overrides = ov
    await existing.update()


def _to_utc_iso(dt: datetime | None) -> str | None:
    """Serialize a stored last_seen as an explicit-UTC ISO string.

    last_seen is written with a naive UTC value (``datetime.utcnow``) and read
    back naive from SQLite. Stamping ``tzinfo=UTC`` makes the ISO string carry
    a ``+00:00`` offset so a JS client (``Date.parse``) cannot misread a
    tz-less string as local time and show a just-seen kiosk as stale
    (calvin-dd9.16).
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.isoformat()


async def list_kiosks() -> list[dict]:
    """Return known kiosks, newest-seen first."""
    rows = await KioskDB.objects.order_by("-last_seen").all()
    return [
        {
            "id": row.id,
            "hostname": row.hostname,
            "lastSeen": _to_utc_iso(row.last_seen),
            "lastAppliedVersion": row.last_applied_version,
            "agentVersion": row.agent_version,
            "agentUpdateStatus": row.agent_update_status,
            "agentUpdateRequested": agent_update_requested(row.overrides),
        }
        for row in rows
    ]


@retry_on_db_locked()
async def request_agent_update(kiosk_id: str) -> bool:
    """Flag a kiosk for agent update. False if the kiosk is unknown/malformed."""
    if not kiosk_id or not _KIOSK_ID_RE.fullmatch(kiosk_id):
        return False
    existing = await KioskDB.objects.get_or_none(id=kiosk_id)
    if existing is None:
        return False
    ov = dict(existing.overrides or {})
    ov[_UPDATE_FLAG_KEY] = True
    existing.overrides = ov
    existing.agent_update_status = "updating"
    await existing.update()
    return True


def merge_overrides(base: dict, overrides: dict | None) -> dict:
    """Shallow top-level merge: each override key replaces that base key wholesale.

    No recursion, no array merge. Returns a new dict; `base` is not mutated.
    """
    if not overrides:
        return dict(base)
    return {**base, **overrides}


def device_config_version(merged: dict) -> str:
    """Stable 16-char hex digest of the device-physical subset of a merged config.

    Same inputs -> same version; any DEVICE_PHYSICAL_KEYS change -> new version;
    non-device-physical changes do not bump it.
    """
    subset = {k: merged.get(k) for k in DEVICE_PHYSICAL_KEYS}
    blob = json.dumps(subset, sort_keys=True, default=str)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:16]


async def get_overrides(kiosk_id: str) -> dict | None:
    """Return a kiosk's raw override layer, or None if the kiosk is unknown."""
    row = await KioskDB.objects.get_or_none(id=kiosk_id)
    if row is None:
        return None
    return row.overrides or {}


@retry_on_db_locked()
async def set_overrides(kiosk_id: str, overrides: dict) -> None:
    """Upsert the kiosk row and replace its overrides. No-op on malformed id."""
    if not kiosk_id or not _KIOSK_ID_RE.fullmatch(kiosk_id):
        logger.warning(f"Refusing to set overrides for malformed kiosk_id: {kiosk_id!r}")
        return
    now = datetime.utcnow()
    existing = await KioskDB.objects.get_or_none(id=kiosk_id)
    if existing is None:
        try:
            await KioskDB.objects.create(id=kiosk_id, last_seen=now, overrides=overrides)
            return
        except _INTEGRITY_ERRORS:
            # Lost a create race: another request inserted this id between our
            # get_or_none and create. Fall through to the update path.
            logger.debug(
                f"Create race for kiosk {kiosk_id!r} in set_overrides; updating existing row"
            )
            existing = await KioskDB.objects.get_or_none(id=kiosk_id)
            if existing is None:
                # Extremely unlikely (row vanished again); nothing safe to do.
                return
    existing.overrides = overrides
    await existing.update()
