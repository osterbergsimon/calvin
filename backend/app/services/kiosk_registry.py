"""Registry of known kiosks (per-device settings model — calvin-dd9.2)."""

import hashlib
import json
import re
import sqlite3
from datetime import datetime

from loguru import logger
from sqlalchemy.exc import IntegrityError as SAIntegrityError

from app.models.db_models import KioskDB
from app.utils.db_retry import retry_on_db_locked
from app.utils.utc import as_utc, utcnow

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

_UPDATE_FLAG_KEY = (
    "_agentUpdateRequested"  # stored in overrides; host-internal, not a device setting
)


def agent_update_requested(overrides: dict | None) -> bool:
    return bool((overrides or {}).get(_UPDATE_FLAG_KEY))


def public_overrides(overrides: dict | None) -> dict:
    """Return an override layer safe to hand to the UI.

    Host-internal agent keys never belong in a device setting, so they are
    stripped before the layer leaves the server (CLV-36). Returns a new dict.
    """
    ov = dict(overrides or {})
    ov.pop(_UPDATE_FLAG_KEY, None)
    return ov


def _normalized_viewport(viewport: dict | None) -> dict | None:
    """Accept only a sane ``{w, h}`` pair of positive ints. Anything else is None."""
    if not isinstance(viewport, dict):
        return None
    w, h = viewport.get("w"), viewport.get("h")
    if not isinstance(w, int) or not isinstance(h, int):
        return None
    if w <= 0 or h <= 0 or w > 20000 or h > 20000:
        return None
    return {"w": w, "h": h}


@retry_on_db_locked()
async def record_kiosk(
    kiosk_id: str,
    hostname: str | None = None,
    agent_version: str | None = None,
    agent_status: str | None = None,
    agent_message: str | None = None,
    available_version: str | None = None,
    viewport: dict | None = None,
) -> None:
    """Upsert a kiosk's registry row. No-op when kiosk_id is empty/None."""
    if not kiosk_id:
        return
    if not _KIOSK_ID_RE.fullmatch(kiosk_id):
        logger.warning(f"Ignoring malformed kiosk_id: {kiosk_id!r}")
        return
    if hostname is not None and len(hostname) > 255:
        hostname = hostname[:255]
    # It is free text from the kiosk; the column caps it at 255.
    if agent_message is not None and len(agent_message) > 255:
        agent_message = agent_message[:255]
    viewport = _normalized_viewport(viewport)

    now = utcnow()
    existing = await KioskDB.objects.get_or_none(id=kiosk_id)
    if existing is None:
        try:
            await KioskDB.objects.create(
                id=kiosk_id,
                hostname=hostname,
                last_seen=now,
                agent_version=agent_version,
                agent_update_status=agent_status,
                agent_update_message=agent_message,
                viewport=viewport,
            )
            logger.info(f"Registered new kiosk: {kiosk_id!r} (hostname={hostname!r})")
            return
        except _INTEGRITY_ERRORS:
            # Lost a create race: another request inserted this id between our
            # get_or_none and create. Fall through to the update path.
            logger.debug(
                f"Create race for kiosk {kiosk_id!r} in record_kiosk; updating existing row"
            )
            existing = await KioskDB.objects.get_or_none(id=kiosk_id)
            if existing is None:
                # Extremely unlikely (row vanished again); nothing safe to do.
                return

    existing.last_seen = now
    if hostname:
        existing.hostname = hostname
    if agent_version is not None:
        existing.agent_version = agent_version
    if agent_status is not None:
        existing.agent_update_status = agent_status
    if agent_message is not None:
        existing.agent_update_message = agent_message
    if viewport is not None:
        existing.viewport = viewport
    # Auto-clear the update flag only once the agent confirms it runs the AVAILABLE
    # (target) version — clearing on any reported version would cancel a just-issued
    # request before the agent ever sees it.
    if (
        agent_version is not None
        and available_version is not None
        and agent_version == available_version
        and existing.overrides
    ):
        ov = dict(existing.overrides)
        if ov.pop(_UPDATE_FLAG_KEY, None) is not None:
            existing.overrides = ov
    await existing.update()


def _to_utc_iso(dt: datetime | None) -> str | None:
    """Serialize a stored last_seen as an explicit-UTC ISO string.

    Values are stored as naive UTC text and the model reads them back aware
    (see :mod:`app.utils.utc`). The ISO string keeps the ``+00:00`` offset so
    a JS client (``Date.parse``) cannot misread a tz-less string as local time
    and show a just-seen kiosk as stale (calvin-dd9.16).
    """
    if dt is None:
        return None
    return as_utc(dt).isoformat()


async def list_kiosks() -> list[dict]:
    """Return known kiosks, newest-seen first, with their public overrides.

    Overrides and viewport ride along so the UI can name a screen, draw its
    start-page thumbnail and preview it without one request per kiosk (CLV-36).
    """
    rows = await KioskDB.objects.order_by("-last_seen").all()
    return [
        {
            "id": row.id,
            "hostname": row.hostname,
            "lastSeen": _to_utc_iso(row.last_seen),
            "lastAppliedVersion": row.last_applied_version,
            "agentVersion": row.agent_version,
            "agentUpdateStatus": row.agent_update_status,
            "agentUpdateMessage": row.agent_update_message,
            "agentUpdateRequested": agent_update_requested(row.overrides),
            "overrides": public_overrides(row.overrides),
            "viewport": _normalized_viewport(row.viewport),
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


_CAMEL_BOUNDARY_RE = re.compile(r"(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])")


def _spelling_signature(key: str) -> str:
    """Token shared by the snake_case and camelCase spellings of one setting."""
    return re.sub(r"[^a-z0-9]", "", key.lower())


def _alternate_spelling(key: str) -> str:
    """Return the other spelling of a config key (camelCase <-> snake_case)."""
    if "_" in key:
        head, *rest = key.split("_")
        return head + "".join(part[:1].upper() + part[1:] for part in rest if part)
    return _CAMEL_BOUNDARY_RE.sub("_", key).lower()


def merge_overrides(base: dict, overrides: dict | None) -> dict:
    """Shallow top-level merge: each override key replaces that base key wholesale.

    No recursion, no array merge. Returns a new dict; `base` is not mutated.

    Per-screen overrides may arrive in either spelling: the Settings UI writes
    camelCase while the stored household config and the kiosk agent use
    snake_case (the agent reads snake first). An override therefore replaces
    both spellings of its setting, so it wins regardless of which one the
    reader asks for first (CLV-101). Host-internal keys (leading ``_``) are
    exempt.
    """
    if not overrides:
        return dict(base)
    merged = {**base, **overrides}
    for key, value in overrides.items():
        if key.startswith("_"):
            continue
        signature = _spelling_signature(key)
        spellings = [
            existing
            for existing in merged
            if not existing.startswith("_") and _spelling_signature(existing) == signature
        ]
        if len(spellings) < 2:
            twin = _alternate_spelling(key)
            if twin != key and not twin.startswith("_"):
                spellings.append(twin)
        for spelling in spellings:
            merged[spelling] = value
    return merged


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


_GLOBAL_NAME_KEYS = ("displayName", "display_name")


@retry_on_db_locked()
async def migrate_global_room_name() -> None:
    """Move the retired global room name onto the one screen that can own it (CLV-84).

    The room name is per-screen now: a screen's own ``displayName`` override.
    A value left in the global config is moved to the only screen without a name
    when there is exactly one such screen; otherwise it is dropped. Deleting the
    global keys makes a second run a no-op.
    """
    from app.services.config_service import config_service

    global_name = ""
    for key in _GLOBAL_NAME_KEYS:
        value = await config_service.get_value(key)
        if isinstance(value, str) and value.strip():
            global_name = value.strip()
            break
    if not global_name:
        return

    rows = await KioskDB.objects.all()
    unnamed = [row for row in rows if not (row.overrides or {}).get("displayName")]
    if len(unnamed) == 1:
        target = unnamed[0]
        overrides = dict(target.overrides or {})
        overrides["displayName"] = global_name
        target.overrides = overrides
        await target.update()
        logger.info(f"Moved the global room name onto screen {target.id!r}")
    else:
        logger.warning(
            f"Dropped the global room name {global_name!r}: {len(unnamed)} unnamed screens; "
            "set it per screen in Settings › Screens"
        )

    for key in _GLOBAL_NAME_KEYS:
        await config_service.delete_value(key)
    logger.info("Retired the global room name (CLV-84)")


@retry_on_db_locked()
async def set_overrides(kiosk_id: str, overrides: dict) -> None:
    """Upsert the kiosk row and replace its overrides. No-op on malformed id."""
    if not kiosk_id or not _KIOSK_ID_RE.fullmatch(kiosk_id):
        logger.warning(f"Refusing to set overrides for malformed kiosk_id: {kiosk_id!r}")
        return
    now = utcnow()
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
