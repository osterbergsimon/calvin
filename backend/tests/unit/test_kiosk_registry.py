"""Unit tests for the kiosk registry service."""

import importlib.util
import re
import sqlite3
from datetime import UTC, datetime, timedelta
from pathlib import Path

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
        "agentUpdateMessage",
        "agentUpdateRequested",
        "overrides",
        "viewport",
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


@pytest.mark.asyncio
@pytest.mark.unit
async def test_record_kiosk_stores_and_lists_viewport(test_db):
    """A reported viewport is stored and returned by the list (CLV-36)."""
    await kiosk_registry.record_kiosk("hall-1", hostname="pi-hall", viewport={"w": 1080, "h": 1920})
    row = await KioskDB.objects.get(id="hall-1")
    assert row.viewport == {"w": 1080, "h": 1920}
    kiosks = await kiosk_registry.list_kiosks()
    assert kiosks[0]["viewport"] == {"w": 1080, "h": 1920}


@pytest.mark.asyncio
@pytest.mark.unit
@pytest.mark.parametrize(
    "bad", [{"w": 0, "h": 1920}, {"w": 1080, "h": -1}, {"w": "1080", "h": 1920}, {"w": 1080}]
)
async def test_record_kiosk_rejects_bad_viewport(test_db, bad):
    """Malformed viewport reports are ignored, never stored."""
    await kiosk_registry.record_kiosk("hall-2", viewport=bad)
    row = await KioskDB.objects.get(id="hall-2")
    assert row.viewport is None


@pytest.mark.asyncio
@pytest.mark.unit
async def test_list_kiosks_strips_agent_only_override_keys(test_db):
    """The public override layer never exposes the host-internal update flag."""
    await kiosk_registry.record_kiosk("hall-3")
    await kiosk_registry.request_agent_update("hall-3")
    assert (await get_overrides("hall-3"))["_agentUpdateRequested"] is True
    listed = (await kiosk_registry.list_kiosks())[0]
    assert listed["agentUpdateRequested"] is True
    assert "_agentUpdateRequested" not in listed["overrides"]


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


# snake_case/camelCase pairs the kiosk agent reads; an override in either
# spelling must win for both (CLV-101).
_SPELLING_PAIRS = [
    ("displayScheduleEnabled", "display_schedule_enabled"),
    ("displaySchedule", "display_schedule"),
    ("displayTimeoutEnabled", "display_timeout_enabled"),
    ("displayTimeout", "display_timeout"),
    ("orientationFlipped", "orientation_flipped"),
    ("displayOutput", "display_output"),
    ("displayResolution", "display_resolution"),
    ("applyDisplayRotation", "apply_display_rotation"),
]


@pytest.mark.unit
@pytest.mark.parametrize(("camel", "snake"), _SPELLING_PAIRS)
def test_merge_overrides_camel_override_wins_for_both_spellings(camel, snake):
    base = {snake: "household", camel: "household"}
    merged = merge_overrides(base, {camel: "override"})
    assert merged[snake] == "override"
    assert merged[camel] == "override"
    assert base == {snake: "household", camel: "household"}  # base not mutated


@pytest.mark.unit
@pytest.mark.parametrize(("camel", "snake"), _SPELLING_PAIRS)
def test_merge_overrides_snake_override_wins_for_both_spellings(camel, snake):
    base = {snake: "household", camel: "household"}
    merged = merge_overrides(base, {snake: "override"})
    assert merged[snake] == "override"
    assert merged[camel] == "override"


@pytest.mark.unit
@pytest.mark.parametrize(("camel", "snake"), _SPELLING_PAIRS)
def test_merge_overrides_without_override_keeps_household(camel, snake):
    base = {snake: "household", camel: "household"}
    assert merge_overrides(base, None) == base
    assert merge_overrides(base, {"unrelated": 1}) == {**base, "unrelated": 1}


@pytest.mark.unit
def test_merge_overrides_regression_display_schedule_camel_override():
    """The exact Settings UI case (CLV-101): camel override must disable the schedule.

    The household config carries both spellings (true) and the agent reads the
    snake spelling first, so the override has to replace both.
    """
    base = {
        "display_schedule_enabled": True,
        "displayScheduleEnabled": True,
        "display_schedule": [{"day": 0, "enabled": True, "onTime": "06:00", "offTime": "22:00"}],
        "displaySchedule": [{"day": 0, "enabled": True, "onTime": "06:00", "offTime": "22:00"}],
    }
    merged = merge_overrides(base, {"displayScheduleEnabled": False})
    assert merged["display_schedule_enabled"] is False
    assert merged["displayScheduleEnabled"] is False
    assert merged["display_schedule"] == base["display_schedule"]
    assert merged["displaySchedule"] == base["displaySchedule"]


@pytest.mark.unit
def test_merge_overrides_adds_spelling_missing_from_base():
    merged = merge_overrides({"display_schedule_enabled": True}, {"displayScheduleEnabled": False})
    assert merged["display_schedule_enabled"] is False
    assert merged["displayScheduleEnabled"] is False


@pytest.mark.unit
def test_merge_overrides_leaves_host_internal_keys_alone():
    merged = merge_overrides({}, {"_agentUpdateRequested": True})
    assert merged == {"_agentUpdateRequested": True}


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
    await KioskDB.objects.create(
        id="k-cols",
        agent_version="abc123",
        agent_update_status="ok",
        agent_update_message="updated to abc123",
    )
    row = await KioskDB.objects.get(id="k-cols")
    assert row.agent_version == "abc123"
    assert row.agent_update_status == "ok"
    assert row.agent_update_message == "updated to abc123"


@pytest.mark.asyncio
@pytest.mark.unit
async def test_record_kiosk_stores_agent_report(test_db):
    from app.services import kiosk_registry as kr

    await kr.record_kiosk("k1", hostname="pi", agent_version="v1", agent_status="ok")
    rows = await kr.list_kiosks()
    row = next(r for r in rows if r["id"] == "k1")
    assert row["agentVersion"] == "v1"
    assert row["agentUpdateStatus"] == "ok"
    assert row["agentUpdateMessage"] is None


@pytest.mark.asyncio
@pytest.mark.unit
async def test_record_kiosk_stores_agent_update_message(test_db):
    """The updater's message rides along with the status so the UI can tell a
    python-too-old failure from a rollback (CLV-19)."""
    from app.services import kiosk_registry as kr

    await kr.record_kiosk(
        "k1",
        agent_version="v1",
        agent_status="error",
        agent_message="device python < 3.9; keeping current agent",
    )
    rows = await kr.list_kiosks()
    row = next(r for r in rows if r["id"] == "k1")
    assert row["agentUpdateStatus"] == "error"
    assert row["agentUpdateMessage"] == "device python < 3.9; keeping current agent"


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


# --- CLV-84: the global room name becomes a per-screen name -----------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_global_room_name_moves_to_the_only_unnamed_screen(test_db):
    from app.services import kiosk_registry as kr
    from app.services.config_service import config_service

    await kr.record_kiosk("kitchen")
    await kr.set_overrides("hallway", {"displayName": "Hallway", "orientation": "portrait"})
    await config_service.set_value("displayName", "Lounge")

    await kr.migrate_global_room_name()

    assert await kr.get_overrides("hallway") == {
        "displayName": "Hallway",
        "orientation": "portrait",
    }
    assert await kr.get_overrides("kitchen") == {"displayName": "Lounge"}
    assert await config_service.get_value("displayName") is None


@pytest.mark.asyncio
@pytest.mark.unit
async def test_global_room_name_is_copied_to_every_unnamed_screen(test_db):
    from app.services import kiosk_registry as kr
    from app.services.config_service import config_service

    await kr.record_kiosk("kitchen")
    await kr.record_kiosk("hallway")
    await kr.set_overrides("office", {"displayName": "Office"})
    await kr.set_overrides("porch", {"displayName": "  ", "orientation": "portrait"})
    await config_service.set_value("displayName", "Lounge")

    await kr.migrate_global_room_name()

    assert await kr.get_overrides("kitchen") == {"displayName": "Lounge"}
    assert await kr.get_overrides("hallway") == {"displayName": "Lounge"}
    assert await kr.get_overrides("office") == {"displayName": "Office"}
    assert await kr.get_overrides("porch") == {
        "displayName": "Lounge",
        "orientation": "portrait",
    }
    assert await config_service.get_value("displayName") is None


@pytest.mark.asyncio
@pytest.mark.unit
async def test_global_room_name_is_cleared_when_every_screen_is_named(test_db):
    from app.services import kiosk_registry as kr
    from app.services.config_service import config_service

    await kr.set_overrides("office", {"displayName": "Office"})
    await config_service.set_value("displayName", "Lounge")

    await kr.migrate_global_room_name()

    assert await kr.get_overrides("office") == {"displayName": "Office"}
    assert await config_service.get_value("displayName") is None


@pytest.mark.asyncio
@pytest.mark.unit
async def test_global_room_name_is_kept_until_a_screen_exists(test_db):
    from app.services import kiosk_registry as kr
    from app.services.config_service import config_service

    await config_service.set_value("displayName", "Lounge")

    await kr.migrate_global_room_name()

    # Nothing to copy it to yet: the old key stays so a later run can migrate it.
    assert await config_service.get_value("displayName") == "Lounge"


@pytest.mark.asyncio
@pytest.mark.unit
async def test_screen_registering_after_startup_gets_the_global_room_name(test_db):
    from app.services import kiosk_registry as kr
    from app.services.config_service import config_service

    # First boot after the upgrade: the startup migration finds no screens yet.
    await config_service.set_value("displayName", "Lounge")
    await kr.migrate_global_room_name()

    # The first screen registers later, with no further migration call.
    await kr.record_kiosk("kitchen", hostname="kitchen-pi")

    assert await kr.get_overrides("kitchen") == {"displayName": "Lounge"}
    assert await config_service.get_value("displayName") is None


@pytest.mark.asyncio
@pytest.mark.unit
async def test_screen_created_by_set_overrides_after_startup_gets_the_global_room_name(test_db):
    from app.services import kiosk_registry as kr
    from app.services.config_service import config_service

    await config_service.set_value("display_name", "Lounge")
    await kr.migrate_global_room_name()

    await kr.set_overrides("kitchen", {"orientation": "portrait"})

    assert await kr.get_overrides("kitchen") == {
        "orientation": "portrait",
        "displayName": "Lounge",
    }
    assert await config_service.get_value("display_name") is None


@pytest.mark.asyncio
@pytest.mark.unit
async def test_screen_created_with_its_own_name_keeps_it_and_retires_the_global(test_db):
    from app.services import kiosk_registry as kr
    from app.services.config_service import config_service

    await config_service.set_value("displayName", "Lounge")
    await kr.migrate_global_room_name()

    await kr.set_overrides("kitchen", {"displayName": "Kitchen"})

    assert await kr.get_overrides("kitchen") == {"displayName": "Kitchen"}
    assert await config_service.get_value("displayName") is None


@pytest.mark.asyncio
@pytest.mark.unit
async def test_room_name_migration_writes_only_the_overrides_column(test_db, monkeypatch):
    from app.models.db_models import KioskDB
    from app.services import kiosk_registry as kr
    from app.services.config_service import config_service

    await kr.record_kiosk("kitchen", agent_version="1.0")
    await config_service.set_value("displayName", "Lounge")

    # The migration reads a snapshot; a heartbeat lands before it writes back.
    stale_rows = await KioskDB.objects.all()
    await kr.record_kiosk("kitchen", agent_version="2.0")

    class _StaleObjects:
        async def all(self):
            return stale_rows

    class _StaleKioskDB:
        objects = _StaleObjects()

    monkeypatch.setattr(kr, "KioskDB", _StaleKioskDB)
    await kr.migrate_global_room_name()
    monkeypatch.undo()

    row = await KioskDB.objects.get(id="kitchen")
    assert row.overrides == {"displayName": "Lounge"}
    assert row.agent_version == "2.0"


@pytest.mark.asyncio
@pytest.mark.unit
async def test_global_room_name_migration_is_idempotent(test_db):
    from app.services import kiosk_registry as kr
    from app.services.config_service import config_service

    await kr.record_kiosk("kitchen")
    await config_service.set_value("displayName", "Lounge")

    await kr.migrate_global_room_name()
    await kr.migrate_global_room_name()

    assert await kr.get_overrides("kitchen") == {"displayName": "Lounge"}
    assert await config_service.get_value("displayName") is None

    # A later rename and a new unnamed screen survive further runs untouched.
    await kr.set_overrides("kitchen", {"displayName": "Kitchen"})
    await kr.record_kiosk("hallway")
    await kr.migrate_global_room_name()

    assert await kr.get_overrides("kitchen") == {"displayName": "Kitchen"}
    assert await kr.get_overrides("hallway") == {}


@pytest.mark.asyncio
@pytest.mark.unit
async def test_global_room_name_migration_handles_the_snake_case_key(test_db):
    from app.services import kiosk_registry as kr
    from app.services.config_service import config_service

    await kr.record_kiosk("kitchen")
    await config_service.set_value("display_name", "Lounge")

    await kr.migrate_global_room_name()

    assert await kr.get_overrides("kitchen") == {"displayName": "Lounge"}
    assert await config_service.get_value("display_name") is None


async def _count_kiosk_updates(monkeypatch) -> list:
    calls: list = []
    real_update = KioskDB.update

    async def counting_update(self, *args, **kwargs):
        calls.append(self.id)
        return await real_update(self, *args, **kwargs)

    monkeypatch.setattr(KioskDB, "update", counting_update)
    return calls


@pytest.mark.asyncio
@pytest.mark.unit
async def test_record_kiosk_skips_write_when_unchanged_and_recent(test_db, monkeypatch):
    """A 60 s poll with nothing new must not rewrite a fresh last_seen (calvin-stnq)."""
    await kiosk_registry.record_kiosk("k-skip", hostname="pi", agent_version="v1")
    first_seen = (await KioskDB.objects.get(id="k-skip")).last_seen
    calls = await _count_kiosk_updates(monkeypatch)

    await kiosk_registry.record_kiosk("k-skip", hostname="pi", agent_version="v1")

    assert calls == []
    assert (await KioskDB.objects.get(id="k-skip")).last_seen == first_seen


@pytest.mark.asyncio
@pytest.mark.unit
async def test_record_kiosk_writes_when_last_seen_is_old(test_db, monkeypatch):
    await kiosk_registry.record_kiosk("k-old", hostname="pi")
    row = await KioskDB.objects.get(id="k-old")
    row.last_seen = datetime.now(UTC) - timedelta(
        seconds=kiosk_registry.LAST_SEEN_WRITE_INTERVAL_S + 1
    )
    await row.update()
    stale = (await KioskDB.objects.get(id="k-old")).last_seen
    calls = await _count_kiosk_updates(monkeypatch)

    await kiosk_registry.record_kiosk("k-old", hostname="pi")

    assert calls == ["k-old"]
    assert (await KioskDB.objects.get(id="k-old")).last_seen > stale


def _update_flag_cleared(row) -> bool:
    return not kiosk_registry.agent_update_requested(row.overrides)


# (first poll, second poll, check on the stored row). Each second poll changes
# exactly one stored field, so it must be written although last_seen is fresh.
_CHANGED_FIELD_CASES = {
    "agent_version": (
        {"agent_version": "v1"},
        {"agent_version": "v2"},
        lambda row: row.agent_version == "v2",
    ),
    "agent_status": (
        {"agent_version": "v1", "agent_status": "ok"},
        {"agent_version": "v1", "agent_status": "error"},
        lambda row: row.agent_update_status == "error",
    ),
    "agent_message": (
        {"agent_version": "v1", "agent_message": "fine"},
        {"agent_version": "v1", "agent_message": "disk full"},
        lambda row: row.agent_update_message == "disk full",
    ),
    "viewport": (
        {"agent_version": "v1", "viewport": {"w": 800, "h": 480}},
        {"agent_version": "v1", "viewport": {"w": 1024, "h": 600}},
        lambda row: row.viewport == {"w": 1024, "h": 600},
    ),
    "update_flag_auto_clear": (
        {"agent_version": "v1"},
        {"agent_version": "v1", "available_version": "v1"},
        _update_flag_cleared,
    ),
}


@pytest.mark.asyncio
@pytest.mark.unit
@pytest.mark.parametrize("case", list(_CHANGED_FIELD_CASES))
async def test_record_kiosk_writes_when_a_field_changes(test_db, monkeypatch, case):
    first, second, check = _CHANGED_FIELD_CASES[case]
    await kiosk_registry.record_kiosk("k-chg", hostname="pi", **first)
    if case == "update_flag_auto_clear":
        assert await kiosk_registry.request_agent_update("k-chg") is True
    calls = await _count_kiosk_updates(monkeypatch)

    await kiosk_registry.record_kiosk("k-chg", hostname="pi", **second)

    assert calls == ["k-chg"]
    assert check(await KioskDB.objects.get(id="k-chg"))


_AGENT_PATH = (
    Path(__file__).resolve().parents[3] / "deploy" / "kiosk-agent" / "calvin_display_agent.py"
)
_SCREENS_SETTINGS_PATH = (
    Path(__file__).resolve().parents[3]
    / "frontend"
    / "src"
    / "components"
    / "settings"
    / "categories"
    / "ScreensSettings.vue"
)


def _agent_poll_seconds() -> int:
    spec = importlib.util.spec_from_file_location("_calvin_display_agent", _AGENT_PATH)
    assert spec and spec.loader
    agent = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(agent)
    return agent.DEFAULT_REFRESH_SECONDS


def _ui_online_window_seconds() -> float:
    match = re.search(
        r"^const ONLINE_WINDOW_MS = ([\d_]+);", _SCREENS_SETTINGS_PATH.read_text(), re.MULTILINE
    )
    assert match, "could not find ONLINE_WINDOW_MS in ScreensSettings.vue"
    return int(match.group(1)) / 1000


def test_last_seen_skip_keeps_screen_online_between_polls():
    """Skipped writes plus one poll gap stay inside the UI's online window."""
    poll_s, online_window_s = _agent_poll_seconds(), _ui_online_window_seconds()
    assert kiosk_registry.LAST_SEEN_WRITE_INTERVAL_S + poll_s < online_window_s


# --- calvin-3xz9: the global photo frame becomes a per-screen setting --------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_global_photo_frame_moves_to_screens_without_their_own(test_db):
    from app.services import kiosk_registry as kr
    from app.services.config_service import config_service

    await kr.record_kiosk("kitchen")
    await kr.set_overrides("hallway", {"photoFrameEnabled": False, "photoFrameTimeout": 600})
    await config_service.set_value("photo_frame_enabled", True)
    await config_service.set_value("photo_frame_timeout", 300)

    await kr.migrate_global_photo_frame()

    # A screen with no choice of its own inherits the old global value ...
    assert await kr.get_overrides("kitchen") == {
        "photoFrameEnabled": True,
        "photoFrameTimeout": 300,
    }
    # ... and one that already chose keeps it.
    assert await kr.get_overrides("hallway") == {
        "photoFrameEnabled": False,
        "photoFrameTimeout": 600,
    }
    # The global stays as the fallback for a browser that is not a known screen.
    assert await config_service.get_value("photo_frame_enabled") is True
    assert await config_service.get_value("photo_frame_timeout") == 300


@pytest.mark.asyncio
@pytest.mark.unit
async def test_photo_frame_migration_reads_snake_case_globals(test_db):
    from app.services import kiosk_registry as kr
    from app.services.config_service import config_service

    await kr.record_kiosk("kitchen")
    await config_service.set_value("photo_frame_enabled", True)
    await config_service.set_value("photo_frame_timeout", 120)

    await kr.migrate_global_photo_frame()

    assert await kr.get_overrides("kitchen") == {
        "photoFrameEnabled": True,
        "photoFrameTimeout": 120,
    }


@pytest.mark.asyncio
@pytest.mark.unit
async def test_photo_frame_migration_respects_a_snake_case_screen_choice(test_db):
    from app.services import kiosk_registry as kr
    from app.services.config_service import config_service

    await kr.set_overrides("hallway", {"photo_frame_enabled": False})
    await config_service.set_value("photo_frame_enabled", True)
    await config_service.set_value("photo_frame_timeout", 300)

    await kr.migrate_global_photo_frame()

    # The screen's own (snake_case) choice wins and is not duplicated; the
    # setting it has not chosen is copied.
    assert await kr.get_overrides("hallway") == {
        "photo_frame_enabled": False,
        "photoFrameTimeout": 300,
    }


@pytest.mark.asyncio
@pytest.mark.unit
async def test_global_photo_frame_is_kept_until_a_screen_exists(test_db):
    from app.services import kiosk_registry as kr
    from app.services.config_service import config_service

    await config_service.set_value("photo_frame_enabled", True)
    await config_service.set_value("photo_frame_timeout", 900)

    await kr.migrate_global_photo_frame()

    # Nothing to copy it to yet: the fallback stays for the first screen.
    assert await config_service.get_value("photo_frame_enabled") is True
    assert await config_service.get_value("photo_frame_timeout") == 900

    # The first screen registers later and adopts it without another migration.
    await kr.record_kiosk("kitchen")

    assert await kr.get_overrides("kitchen") == {
        "photoFrameEnabled": True,
        "photoFrameTimeout": 900,
    }


@pytest.mark.asyncio
@pytest.mark.unit
async def test_screen_created_by_set_overrides_adopts_the_global_photo_frame(test_db):
    from app.services import kiosk_registry as kr
    from app.services.config_service import config_service

    await config_service.set_value("photo_frame_enabled", True)
    await config_service.set_value("photo_frame_timeout", 300)
    await kr.migrate_global_photo_frame()

    await kr.set_overrides("kitchen", {"orientation": "portrait"})

    assert await kr.get_overrides("kitchen") == {
        "orientation": "portrait",
        "photoFrameEnabled": True,
        "photoFrameTimeout": 300,
    }


@pytest.mark.asyncio
@pytest.mark.unit
async def test_photo_frame_migration_is_idempotent_and_keeps_screen_choices(test_db):
    from app.services import kiosk_registry as kr
    from app.services.config_service import config_service

    await kr.record_kiosk("kitchen")
    await config_service.set_value("photo_frame_enabled", True)
    await config_service.set_value("photo_frame_timeout", 300)

    await kr.migrate_global_photo_frame()
    await kr.migrate_global_photo_frame()

    assert await kr.get_overrides("kitchen") == {
        "photoFrameEnabled": True,
        "photoFrameTimeout": 300,
    }

    # A later global change never overwrites a screen that already has a value.
    await config_service.set_value("photo_frame_enabled", False)
    await config_service.set_value("photo_frame_timeout", 60)
    await kr.migrate_global_photo_frame()

    assert await kr.get_overrides("kitchen") == {
        "photoFrameEnabled": True,
        "photoFrameTimeout": 300,
    }


@pytest.mark.asyncio
@pytest.mark.unit
async def test_photo_frame_migration_writes_only_the_overrides_column(test_db, monkeypatch):
    from app.models.db_models import KioskDB
    from app.services import kiosk_registry as kr
    from app.services.config_service import config_service

    await kr.record_kiosk("kitchen", agent_version="1.0")
    await config_service.set_value("photo_frame_enabled", True)
    await config_service.set_value("photo_frame_timeout", 300)

    # The migration reads a snapshot; a heartbeat lands before it writes back.
    stale_rows = await KioskDB.objects.all()
    await kr.record_kiosk("kitchen", agent_version="2.0")

    class _StaleObjects:
        async def all(self):
            return stale_rows

    class _StaleKioskDB:
        objects = _StaleObjects()

    monkeypatch.setattr(kr, "KioskDB", _StaleKioskDB)
    await kr.migrate_global_photo_frame()
    monkeypatch.undo()

    row = await KioskDB.objects.get(id="kitchen")
    assert row.overrides == {"photoFrameEnabled": True, "photoFrameTimeout": 300}
    assert row.agent_version == "2.0"
