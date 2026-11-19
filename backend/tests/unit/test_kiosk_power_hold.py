"""The kiosk power hold and the agent feature report (calvin-2ifv)."""

import json

import pytest

from app.models.db_models import KioskDB
from app.services import kiosk_registry
from app.services.kiosk_registry import (
    clear_power_hold,
    get_overrides,
    get_power_hold,
    set_overrides,
    set_power_hold,
)

pytestmark = [pytest.mark.asyncio, pytest.mark.unit]

KIOSK = "kitchen"


async def _register(kiosk_id: str = KIOSK) -> None:
    await kiosk_registry.record_kiosk(kiosk_id, hostname="pi")


async def _listed(kiosk_id: str = KIOSK) -> dict:
    return next(k for k in await kiosk_registry.list_kiosks() if k["id"] == kiosk_id)


async def test_set_get_clear_round_trip(test_db):
    await _register()
    assert await get_power_hold(KIOSK) is None
    hold = await set_power_hold(KIOSK, "off", "automation")
    assert hold is not None
    assert hold["power"] == "off" and hold["by"] == "automation"
    assert hold["setAt"].endswith("Z")
    assert await get_power_hold(KIOSK) == hold
    assert await clear_power_hold(KIOSK) is True
    assert await get_power_hold(KIOSK) is None
    assert await clear_power_hold(KIOSK) is False


async def test_set_hold_removes_screen_now_but_keeps_other_keys(test_db):
    await _register()
    await set_overrides(
        KIOSK,
        {"displayName": "Kitchen", "screenNow": {"power": "on", "setAt": "2026-11-18T10:00:00Z"}},
    )
    await set_power_hold(KIOSK, "off", "automation")
    assert await get_overrides(KIOSK) == {"displayName": "Kitchen"}


async def test_clear_hold_also_removes_screen_now(test_db):
    await _register()
    await set_overrides(KIOSK, {"screen_now": {"power": "on", "setAt": "2026-11-18T10:00:00Z"}})
    assert await clear_power_hold(KIOSK) is True
    assert await get_overrides(KIOSK) == {}


async def test_unknown_kiosk_creates_nothing(test_db):
    assert await set_power_hold("ghost", "off", "automation") is None
    assert await clear_power_hold("ghost") is None
    assert await get_power_hold("ghost") is None
    assert await KioskDB.objects.count() == 0


async def test_invalid_power_or_writer_is_refused(test_db):
    await _register()
    with pytest.raises(ValueError):
        await set_power_hold(KIOSK, "dim", "automation")
    with pytest.raises(ValueError):
        await set_power_hold(KIOSK, "off", "Homey key")


async def test_layer_replace_leaves_the_hold(test_db):
    await _register()
    await set_power_hold(KIOSK, "off", "automation")
    await set_overrides(KIOSK, {"displayName": "Kitchen"})
    assert (await get_power_hold(KIOSK))["power"] == "off"


async def test_heartbeat_leaves_the_hold(test_db):
    await _register()
    await set_power_hold(KIOSK, "off", "automation")
    await kiosk_registry.record_kiosk(KIOSK, hostname="pi-renamed", agent_version="v2")
    assert (await get_power_hold(KIOSK))["power"] == "off"


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


async def test_list_shows_the_hold_without_a_key_name(test_db):
    await _register()
    assert (await _listed())["powerHold"] is None
    await set_power_hold(KIOSK, "on", "automation")
    listed = await _listed()
    assert listed["powerHold"]["power"] == "on"
    assert listed["powerHold"]["by"] == "automation"
    assert set(listed["powerHold"]) == {"power", "setAt", "by"}
    assert "Homey" not in json.dumps(listed)


async def test_malformed_stored_hold_reads_as_none(test_db):
    await _register()
    row = await KioskDB.objects.get(id=KIOSK)
    row.power_hold = {"power": "dim"}
    await row.update(_columns=["power_hold"])
    assert await get_power_hold(KIOSK) is None
    assert (await _listed())["powerHold"] is None


async def test_heartbeat_never_writes_back_the_layer(test_db, monkeypatch):
    """A poll must not put back a screenNow that a hold change just removed."""
    await _register()
    await set_overrides(KIOSK, {"screenNow": {"power": "on", "setAt": "2026-11-18T10:00:00Z"}})
    written: list[list[str]] = []
    original = KioskDB.update

    async def spy(self, _columns=None, **kwargs):
        written.append(list(_columns or []))
        return await original(self, _columns=_columns, **kwargs)

    monkeypatch.setattr(KioskDB, "update", spy)
    await kiosk_registry.record_kiosk(KIOSK, hostname="pi-new", agent_version="v3")
    assert written and all("overrides" not in columns for columns in written)
