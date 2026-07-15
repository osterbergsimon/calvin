"""Unit tests for the kiosk registry service."""

import sqlite3
from datetime import UTC, datetime, timedelta

import pytest

from app.models.db_models import KioskDB
from app.services import kiosk_registry
from app.services.kiosk_registry import (
    DEVICE_PHYSICAL_KEYS,
    device_config_version,
    get_overrides,
    merge_overrides,
    set_overrides,
)


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
    assert set(kiosks[0]) == {
        "id",
        "hostname",
        "lastSeen",
        "lastAppliedVersion",
        "agentVersion",
        "agentUpdateStatus",
        "agentUpdateRequested",
    }
    assert isinstance(kiosks[0]["lastSeen"], str)  # ISO-8601


@pytest.mark.asyncio
@pytest.mark.unit
async def test_list_kiosks_last_seen_is_utc_aware(test_db):
    """lastSeen must carry an explicit UTC offset so a JS client parsing a
    tz-less string as local time cannot misread a just-seen kiosk as hours
    stale (calvin-dd9.16)."""
    before = datetime.now(UTC)
    await kiosk_registry.record_kiosk("hallway-b71e04", hostname="pi-hallway")
    kiosks = await kiosk_registry.list_kiosks()

    parsed = datetime.fromisoformat(kiosks[0]["lastSeen"])
    assert parsed.tzinfo is not None, "lastSeen must be timezone-aware, not naive"
    assert parsed.utcoffset() == timedelta(0), "lastSeen must be expressed in UTC"
    # And it must represent ~now in UTC, not shifted by the local tz offset.
    assert abs((parsed - before).total_seconds()) < 60


@pytest.mark.asyncio
@pytest.mark.unit
async def test_record_kiosk_rejects_over_long_id(test_db):
    """A kiosk_id longer than 64 chars must be rejected — no row written."""
    long_id = "x" * 300
    await kiosk_registry.record_kiosk(long_id, hostname="somehost")
    assert await KioskDB.objects.count() == 0


@pytest.mark.asyncio
@pytest.mark.unit
@pytest.mark.parametrize("bad_id", ["a b", "x;y", "..%2f", "kitchen\n", "id/../etc", "a\tb"])
async def test_record_kiosk_rejects_invalid_shape(test_db, bad_id):
    """An id with characters outside [A-Za-z0-9._-] writes no row."""
    await kiosk_registry.record_kiosk(bad_id, hostname="somehost")
    assert await KioskDB.objects.count() == 0


@pytest.mark.asyncio
@pytest.mark.unit
@pytest.mark.parametrize("good_id", ["kitchen", "raspberrypi-3f9a2c", "pi_hall.2", "A-b_c.1"])
async def test_record_kiosk_accepts_valid_shape(test_db, good_id):
    """Friendly names and default <host>-<hex> ids are accepted."""
    await kiosk_registry.record_kiosk(good_id, hostname="somehost")
    assert await KioskDB.objects.count() == 1


@pytest.mark.asyncio
@pytest.mark.unit
async def test_record_kiosk_create_race_falls_through_to_update(test_db, monkeypatch):
    """If two requests race to create the same new id, the loser's IntegrityError
    must be swallowed and fall through to the update path — exactly one row, no
    exception propagates."""
    from ormar.queryset.queryset import QuerySet

    real_create = QuerySet.create
    calls = {"n": 0}

    async def racing_create(self, **kwargs):
        # First create call: simulate the losing side of a create race by
        # actually inserting the row (so it exists) then raising IntegrityError.
        if calls["n"] == 0:
            calls["n"] += 1
            await real_create(self, **kwargs)
            raise sqlite3.IntegrityError("UNIQUE constraint failed: kiosks.id")
        return await real_create(self, **kwargs)

    monkeypatch.setattr(QuerySet, "create", racing_create)

    # Must not raise.
    await kiosk_registry.record_kiosk("kitchen-3f9a2c", hostname="pi-kitchen")

    assert await KioskDB.objects.count() == 1
    row = await KioskDB.objects.get(id="kitchen-3f9a2c")
    assert row.hostname == "pi-kitchen"
    assert row.last_seen is not None


@pytest.mark.asyncio
@pytest.mark.unit
async def test_record_kiosk_truncates_over_long_hostname(test_db):
    """A hostname longer than 255 chars must be truncated to 255, not rejected."""
    long_host = "h" * 300
    await kiosk_registry.record_kiosk("kiosk-abc123", hostname=long_host)
    row = await KioskDB.objects.get(id="kiosk-abc123")
    assert row.hostname is not None
    assert len(row.hostname) == 255


@pytest.mark.unit
def test_merge_overrides_shallow_replace():
    base = {"orientation": "landscape", "timeFormat": "24h", "themeMode": "auto"}
    out = merge_overrides(base, {"orientation": "portrait"})
    assert out["orientation"] == "portrait"  # override wins
    assert out["timeFormat"] == "24h"  # falls through
    assert base["orientation"] == "landscape"  # base not mutated


@pytest.mark.unit
def test_merge_overrides_top_level_only():
    base = {"dashboardScreens": {"version": 2, "screens": ["a", "b"]}}
    out = merge_overrides(base, {"dashboardScreens": {"version": 3}})
    assert out["dashboardScreens"] == {"version": 3}  # wholesale replace, no deep merge


@pytest.mark.unit
def test_merge_overrides_empty_and_none():
    base = {"a": 1}
    assert merge_overrides(base, None) == {"a": 1}
    assert merge_overrides(base, {}) == {"a": 1}


@pytest.mark.unit
def test_device_config_version_stable_and_selective():
    merged = {"orientation": "portrait", "displayScheduleEnabled": True, "themeMode": "dark"}
    v1 = device_config_version(merged)
    assert v1 == device_config_version(dict(merged))  # stable
    assert device_config_version({**merged, "themeMode": "light"}) == v1  # non-device key: no bump
    assert device_config_version({**merged, "orientation": "landscape"}) != v1  # device key: bump
    assert isinstance(v1, str) and len(v1) == 16


@pytest.mark.unit
def test_device_physical_keys_membership():
    assert set(DEVICE_PHYSICAL_KEYS) == {
        "orientation",
        "orientationFlipped",
        "applyDisplayRotation",
        "displayScheduleEnabled",
        "displaySchedule",
        "displayBrightness",
        "displayOutput",
        "displayResolution",
    }


@pytest.mark.asyncio
@pytest.mark.unit
async def test_get_overrides_unknown_is_none(test_db):
    assert await get_overrides("nope-000000") is None


@pytest.mark.asyncio
@pytest.mark.unit
async def test_set_overrides_create_race_falls_through_to_update(test_db, monkeypatch):
    """If two requests race to create the same new kiosk row in set_overrides, the
    loser's IntegrityError must be swallowed and the overrides still persisted —
    no exception propagates, exactly one row exists with the expected overrides."""
    from ormar.queryset.queryset import QuerySet

    real_create = QuerySet.create
    calls = {"n": 0}

    async def racing_create(self, **kwargs):
        # First create call: simulate losing the create race by inserting the row
        # (so it exists) then raising IntegrityError.
        if calls["n"] == 0:
            calls["n"] += 1
            await real_create(self, **kwargs)
            raise sqlite3.IntegrityError("UNIQUE constraint failed: kiosks.id")
        return await real_create(self, **kwargs)

    monkeypatch.setattr(QuerySet, "create", racing_create)

    # Must not raise and overrides must be persisted.
    await set_overrides("kitchen-3f9a2c", {"orientation": "portrait"})

    assert await KioskDB.objects.count() == 1
    row = await KioskDB.objects.get(id="kitchen-3f9a2c")
    assert row.overrides == {"orientation": "portrait"}


@pytest.mark.asyncio
@pytest.mark.unit
async def test_set_overrides_upserts_and_replaces(test_db):
    await set_overrides("kitchen-3f9a2c", {"orientation": "portrait"})
    assert await get_overrides("kitchen-3f9a2c") == {"orientation": "portrait"}

    # Replace (not merge): new dict fully supplants the old.
    await set_overrides("kitchen-3f9a2c", {"themeMode": "dark"})
    assert await get_overrides("kitchen-3f9a2c") == {"themeMode": "dark"}

    # Clear.
    await set_overrides("kitchen-3f9a2c", {})
    assert await get_overrides("kitchen-3f9a2c") == {}


@pytest.mark.asyncio
@pytest.mark.unit
async def test_agent_version_columns_roundtrip(test_db):
    await KioskDB.objects.create(id="k-cols", agent_version="abc123", agent_update_status="ok")
    row = await KioskDB.objects.get(id="k-cols")
    assert row.agent_version == "abc123"
    assert row.agent_update_status == "ok"


@pytest.mark.asyncio
@pytest.mark.unit
async def test_record_kiosk_stores_agent_report(test_db):
    from app.services import kiosk_registry as kr

    await kr.record_kiosk("k1", hostname="pi", agent_version="v1", agent_status="ok")
    rows = await kr.list_kiosks()
    row = next(r for r in rows if r["id"] == "k1")
    assert row["agentVersion"] == "v1"
    assert row["agentUpdateStatus"] == "ok"


@pytest.mark.asyncio
@pytest.mark.unit
async def test_request_and_autoclear_update_flag(test_db):
    from app.services import kiosk_registry as kr

    await kr.record_kiosk("k2", agent_version="old")
    assert await kr.request_agent_update("k2") is True
    ov = await kr.get_overrides("k2")
    assert kr.agent_update_requested(ov) is True
    # Agent still reports OLD version but available is NEW — flag must NOT clear
    # (regression guard: clearing here would mean the agent never sees the update request).
    await kr.record_kiosk("k2", agent_version="old", available_version="new")
    ov2 = await kr.get_overrides("k2")
    assert kr.agent_update_requested(ov2) is True, (
        "flag must survive while agent is still on stale version"
    )
    # Agent now reports it runs the NEW version — flag must clear.
    await kr.record_kiosk("k2", agent_version="new", available_version="new")
    ov3 = await kr.get_overrides("k2")
    assert kr.agent_update_requested(ov3) is False, (
        "flag must clear once agent reaches available version"
    )


@pytest.mark.asyncio
@pytest.mark.unit
async def test_request_update_unknown_id_returns_false(test_db):
    from app.services import kiosk_registry as kr

    assert await kr.request_agent_update("../bad") is False
