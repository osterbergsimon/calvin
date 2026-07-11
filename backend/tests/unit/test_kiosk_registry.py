"""Unit tests for the kiosk registry service."""

import pytest

from app.models.db_models import KioskDB
from app.services import kiosk_registry


@pytest.mark.asyncio
@pytest.mark.unit
async def test_record_kiosk_creates_then_updates(test_db):
    await kiosk_registry.record_kiosk("kitchen-3f9a2c", hostname="raspberrypi")
    row = await KioskDB.objects.get(id="kitchen-3f9a2c")
    first_seen = row.last_seen
    assert row.hostname == "raspberrypi"

    # Second call updates last_seen, keeps the row unique.
    await kiosk_registry.record_kiosk("kitchen-3f9a2c", hostname="raspberrypi")
    assert await KioskDB.objects.count() == 1
    row2 = await KioskDB.objects.get(id="kitchen-3f9a2c")
    assert row2.last_seen >= first_seen


@pytest.mark.asyncio
@pytest.mark.unit
async def test_record_kiosk_ignores_empty_id(test_db):
    await kiosk_registry.record_kiosk("", hostname="x")
    await kiosk_registry.record_kiosk(None, hostname="x")  # type: ignore[arg-type]
    assert await KioskDB.objects.count() == 0


@pytest.mark.asyncio
@pytest.mark.unit
async def test_list_kiosks_shape(test_db):
    await kiosk_registry.record_kiosk("hallway-b71e04", hostname="pi-hallway")
    kiosks = await kiosk_registry.list_kiosks()
    assert kiosks and kiosks[0]["id"] == "hallway-b71e04"
    assert set(kiosks[0]) == {"id", "hostname", "lastSeen", "lastAppliedVersion"}
    assert isinstance(kiosks[0]["lastSeen"], str)  # ISO-8601


@pytest.mark.asyncio
@pytest.mark.unit
async def test_record_kiosk_rejects_over_long_id(test_db):
    """A kiosk_id longer than 255 chars must be rejected — no row written."""
    long_id = "x" * 300
    await kiosk_registry.record_kiosk(long_id, hostname="somehost")
    assert await KioskDB.objects.count() == 0


@pytest.mark.asyncio
@pytest.mark.unit
async def test_record_kiosk_truncates_over_long_hostname(test_db):
    """A hostname longer than 255 chars must be truncated to 255, not rejected."""
    long_host = "h" * 300
    await kiosk_registry.record_kiosk("kiosk-abc123", hostname=long_host)
    row = await KioskDB.objects.get(id="kiosk-abc123")
    assert row.hostname is not None
    assert len(row.hostname) == 255
