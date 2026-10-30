"""UTC timestamp handling (calvin-vcy / CLV-57).

SQLite has no timezone-aware column type, so the storage convention is:

* values are **stored** as naive UTC text (``YYYY-MM-DD HH:MM:SS.ffffff``),
  exactly as the old ``datetime.utcnow()`` code wrote them, and
* values are **read back** as timezone-aware UTC datetimes,

so a row written before this change and a fresh ``utcnow()`` can be compared
without a naive-vs-aware ``TypeError`` or an off-by-local-offset shift.
"""

from datetime import UTC, datetime, timedelta

import pytest

from app.models.db_models import KioskDB, PluginTypeDB
from app.services import kiosk_registry
from app.utils.utc import utcnow


@pytest.mark.unit
def test_utcnow_is_aware_utc():
    now = utcnow()
    assert now.tzinfo is not None
    assert now.utcoffset() == timedelta(0)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_legacy_naive_row_reads_back_utc_aware(test_db):
    """A row written by the old naive code must compare cleanly with utcnow()."""
    await test_db.execute(
        "INSERT INTO kiosks (id, last_seen) VALUES ('legacy-1', '2026-01-02 03:04:05.123456')"
    )

    row = await KioskDB.objects.get(id="legacy-1")

    assert row.last_seen.tzinfo is not None, "stored timestamp must read back aware"
    assert row.last_seen.utcoffset() == timedelta(0)
    # Same instant the naive value meant (UTC) — not reinterpreted as local time.
    assert row.last_seen == datetime(2026, 1, 2, 3, 4, 5, 123456, tzinfo=UTC)
    # The comparison that used to raise "can't compare offset-naive and offset-aware".
    assert row.last_seen < utcnow()


@pytest.mark.asyncio
@pytest.mark.unit
async def test_aware_write_still_stores_naive_utc_text(test_db):
    """The on-disk convention is unchanged: naive UTC text, no offset suffix."""
    before = utcnow()
    await kiosk_registry.record_kiosk("kitchen-abc123")

    rows = await test_db.fetch_all("SELECT last_seen FROM kiosks WHERE id = 'kitchen-abc123'")
    stored = rows[0]["last_seen"]

    assert isinstance(stored, str)
    assert "+" not in stored and "Z" not in stored, "stored value must stay naive UTC"
    parsed = datetime.fromisoformat(stored)
    assert parsed.tzinfo is None
    assert before.replace(tzinfo=None) <= parsed <= utcnow().replace(tzinfo=None)

    # And the ORM hands it back aware, in the same instant.
    row = await KioskDB.objects.get(id="kitchen-abc123")
    assert row.last_seen.tzinfo is not None
    assert row.last_seen == parsed.replace(tzinfo=UTC)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_model_timestamp_defaults_are_utc_aware(test_db):
    """Model defaults and touch helpers write aware UTC values."""
    await PluginTypeDB.objects.create(type_id="probe", plugin_type="service", name="Probe")
    row = await PluginTypeDB.objects.get(type_id="probe")

    assert row.created_at.tzinfo is not None
    assert row.updated_at.tzinfo is not None
    assert row.created_at.utcoffset() == timedelta(0)
    assert row.updated_at.utcoffset() == timedelta(0)

    row.enabled = False
    await row.save_with_timestamp()
    assert row.updated_at.tzinfo is not None
    # Round-trips through SQLite without acquiring/losing the offset.
    reloaded = await PluginTypeDB.objects.get(type_id="probe")
    assert reloaded.updated_at.tzinfo is not None
    assert reloaded.updated_at == row.updated_at
