"""Registry of known kiosks (per-device settings model — calvin-dd9.2)."""

from datetime import datetime

from loguru import logger

from app.models.db_models import KioskDB
from app.utils.db_retry import retry_on_db_locked


@retry_on_db_locked()
async def record_kiosk(kiosk_id: str, hostname: str | None = None) -> None:
    """Upsert a kiosk's registry row. No-op when kiosk_id is empty/None."""
    if not kiosk_id:
        return

    if len(kiosk_id) > 255:
        logger.warning(f"Ignoring over-long kiosk_id ({len(kiosk_id)} chars)")
        return

    if hostname is not None and len(hostname) > 255:
        hostname = hostname[:255]

    existing = await KioskDB.objects.get_or_none(id=kiosk_id)
    now = datetime.utcnow()
    if existing is None:
        await KioskDB.objects.create(id=kiosk_id, hostname=hostname, last_seen=now)
        logger.info(f"Registered new kiosk: {kiosk_id} (hostname={hostname})")
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
