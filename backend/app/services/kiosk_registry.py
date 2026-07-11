"""Registry of known kiosks (per-device settings model — calvin-dd9.2)."""

import re
import sqlite3
from datetime import datetime

from loguru import logger
from sqlalchemy.exc import IntegrityError as SAIntegrityError

from app.models.db_models import KioskDB
from app.utils.db_retry import retry_on_db_locked

# Shape allowlist for kiosk ids. Covers the default `<hostname>-<6hex>` ids and
# friendly operator-chosen names like `kitchen`. Anything else (whitespace,
# path separators, control chars, URL-encoded junk) is rejected before any DB
# write to bound growth and neutralise garbage/hostile input.
_KIOSK_ID_RE = re.compile(r"[A-Za-z0-9._-]{1,64}")

# Ormar/`databases` surface the raw sqlite3 error on a PK/UNIQUE conflict; other
# backends may raise the SQLAlchemy wrapper. Catch both so the create-race
# fallthrough works regardless of the underlying driver.
_INTEGRITY_ERRORS = (sqlite3.IntegrityError, SAIntegrityError)


@retry_on_db_locked()
async def record_kiosk(kiosk_id: str, hostname: str | None = None) -> None:
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
            await KioskDB.objects.create(id=kiosk_id, hostname=hostname, last_seen=now)
            logger.info(f"Registered new kiosk: {kiosk_id!r} (hostname={hostname!r})")
            return
        except _INTEGRITY_ERRORS:
            # Lost a create race: another request inserted this id between our
            # get_or_none and create. Fall through to the update path.
            logger.debug(f"Create race for kiosk {kiosk_id!r}; updating existing row")
            existing = await KioskDB.objects.get_or_none(id=kiosk_id)
            if existing is None:
                # Extremely unlikely (row vanished again); nothing safe to do.
                return

    existing.last_seen = now
    if hostname:
        existing.hostname = hostname
    await existing.update()


async def list_kiosks() -> list[dict]:
    """Return known kiosks, newest-seen first."""
    rows = await KioskDB.objects.order_by("-last_seen").all()
    return [
        {
            "id": row.id,
            "hostname": row.hostname,
            "lastSeen": row.last_seen.isoformat() if row.last_seen else None,
            "lastAppliedVersion": row.last_applied_version,
        }
        for row in rows
    ]
