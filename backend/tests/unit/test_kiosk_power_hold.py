"""The kiosk power command and the agent feature report (calvin-2ifv, calvin-25g9)."""

import json
from datetime import UTC, datetime

import pytest

from app.models.db_models import KioskDB
from app.services import kiosk_registry
from app.services.kiosk_registry import (
    clear_power_command,
    get_overrides,
    get_power_command,
    merge_into_overrides,
    power_status,
    set_overrides,
    set_power_command,
)

pytestmark = [pytest.mark.asyncio, pytest.mark.unit]

KIOSK = "kitchen"


def _at(hour: int) -> datetime:
    return datetime(2026, 11, 18, hour, tzinfo=UTC)


async def _register(kiosk_id: str = KIOSK) -> None:
    await kiosk_registry.record_kiosk(kiosk_id, hostname="pi")


async def _listed(kiosk_id: str = KIOSK) -> dict:
    return next(k for k in await kiosk_registry.list_kiosks() if k["id"] == kiosk_id)


async def test_set_get_clear_round_trip(test_db):
    await _register()
    assert await get_power_command(KIOSK) is None
    command = await set_power_command(KIOSK, "off", "automation", mode="schedule")
    assert command is not None
    assert command["power"] == "off"
    assert command["by"] == "automation"
    assert command["mode"] == "schedule"
    assert "keyName" not in command
    assert command["setAt"].endswith("Z")
    assert await get_power_command(KIOSK) == command
    assert await clear_power_command(KIOSK) is True
    assert await get_power_command(KIOSK) is None
    assert await clear_power_command(KIOSK) is False


async def test_the_key_name_is_stored_and_only_shown_by_the_admin_answer(test_db):
    await _register()
    command = await set_power_command(KIOSK, "on", "automation", mode="external", key_name="Homey")
    assert command["keyName"] == "Homey"
    assert (await get_power_command(KIOSK))["keyName"] == "Homey"
    # The kiosk list is public: it never carries the name.
    listed = await _listed()
    assert listed["powerHold"]["power"] == "on"
    assert "keyName" not in listed["powerHold"]
    assert "Homey" not in json.dumps(listed)


async def test_set_command_removes_screen_now_but_keeps_other_keys(test_db):
    await _register()
    await set_overrides(
        KIOSK,
        {"displayName": "Kitchen", "screenNow": {"power": "on", "setAt": "2026-11-18T10:00:00Z"}},
    )
    await set_power_command(KIOSK, "off", "automation", mode="schedule")
    assert await get_overrides(KIOSK) == {"displayName": "Kitchen"}


async def test_clear_command_also_removes_screen_now(test_db):
    await _register()
    await set_overrides(KIOSK, {"screen_now": {"power": "on", "setAt": "2026-11-18T10:00:00Z"}})
    await set_power_command(KIOSK, "off", "settings", mode="schedule")
    assert await clear_power_command(KIOSK) is True
    assert await get_overrides(KIOSK) == {}


async def test_unknown_kiosk_creates_nothing(test_db):
    assert await set_power_command("ghost", "off", "automation", mode="schedule") is None
    assert await clear_power_command("ghost") is None
    assert await get_power_command("ghost") is None
    assert await KioskDB.objects.count() == 0


async def test_invalid_power_writer_or_mode_is_refused(test_db):
    await _register()
    with pytest.raises(ValueError):
        await set_power_command(KIOSK, "dim", "automation", mode="schedule")
    with pytest.raises(ValueError):
        await set_power_command(KIOSK, "off", "Homey key", mode="schedule")
    # A command belongs to Schedule or External; Always on has none.
    with pytest.raises(ValueError):
        await set_power_command(KIOSK, "off", "automation", mode="always_on")


async def test_layer_replace_leaves_the_command(test_db):
    await _register()
    await set_power_command(KIOSK, "off", "automation", mode="schedule")
    await set_overrides(KIOSK, {"displayName": "Kitchen"})
    assert (await get_power_command(KIOSK))["power"] == "off"


async def test_heartbeat_leaves_the_command(test_db):
    await _register()
    await set_power_command(KIOSK, "off", "automation", mode="schedule")
    await kiosk_registry.record_kiosk(KIOSK, hostname="pi-renamed", agent_version="v2")
    assert (await get_power_command(KIOSK))["power"] == "off"


async def test_agent_feature_report(test_db):
    await _register()
    assert (await _listed())["agentHolds"] is None  # no agent poll yet
    await kiosk_registry.record_kiosk(KIOSK, agent_version="v1", agent_features="hold")
    assert (await _listed())["agentHolds"] is True
    # The browser's own poll carries no agent fields and changes nothing.
    await kiosk_registry.record_kiosk(KIOSK, hostname="pi")
    assert (await _listed())["agentHolds"] is True
    # An agent poll without the flag is an agent that cannot hold.
    await kiosk_registry.record_kiosk(KIOSK, agent_version="v0")
    assert (await _listed())["agentHolds"] is False


async def test_unknown_features_are_ignored(test_db):
    await _register()
    await kiosk_registry.record_kiosk(KIOSK, agent_version="v1", agent_features="x" * 300)
    row = await KioskDB.objects.get(id=KIOSK)
    assert row.agent_features == ""
    await kiosk_registry.record_kiosk(KIOSK, agent_version="v1", agent_features="later, hold")
    row = await KioskDB.objects.get(id=KIOSK)
    assert row.agent_features == "hold"


async def test_a_malformed_stored_command_reads_as_none(test_db):
    await _register()
    row = await KioskDB.objects.get(id=KIOSK)
    # A hold written by a backend before the mode existed has no mode: absent.
    row.power_hold = {"power": "off", "setAt": "2026-11-18T10:00:00Z", "by": "automation"}
    await row.update(_columns=["power_hold"])
    assert await get_power_command(KIOSK) is None
    assert (await _listed())["powerHold"] is None
    assert (await power_status(KIOSK))["command"] is None


async def test_the_oldest_readers_get_no_key_name_from_the_status(test_db):
    await _register()
    await set_power_command(KIOSK, "on", "automation", mode="external", key_name="Homey")
    status = await power_status(KIOSK)
    assert status["command"]["keyName"] == "Homey"
    assert status["command"]["mode"] == "external"


async def test_every_layer_write_strips_screen_now(test_db):
    await _register()
    await set_overrides(
        KIOSK, {"displayName": "Kitchen", "screenNow": {"power": "on", "setAt": "x"}}
    )
    assert await get_overrides(KIOSK) == {"displayName": "Kitchen"}
    await merge_into_overrides(
        KIOSK, {"screen_now": {"power": "off", "setAt": "x"}, "orientation": "portrait"}
    )
    assert await get_overrides(KIOSK) == {"displayName": "Kitchen", "orientation": "portrait"}


async def test_the_startup_migration_drops_a_stored_screen_now_once(test_db):
    await _register("kitchen")
    await _register("hall")
    row = await KioskDB.objects.get(id="kitchen")
    row.overrides = {
        "displayName": "Kitchen",
        "screenNow": {"power": "off", "setAt": "2026-11-18T10:00:00Z"},
        "screen_now": {"power": "on", "setAt": "2026-11-18T10:00:00Z"},
    }
    await row.update(_columns=["overrides"])

    assert await kiosk_registry.migrate_strip_screen_now() == 1
    assert await get_overrides("kitchen") == {"displayName": "Kitchen"}
    assert await get_overrides("hall") == {}
    # Idempotent: the second run finds nothing to change.
    assert await kiosk_registry.migrate_strip_screen_now() == 0
    assert await get_overrides("kitchen") == {"displayName": "Kitchen"}
