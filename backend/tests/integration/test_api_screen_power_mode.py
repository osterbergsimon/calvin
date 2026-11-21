"""The household and per-screen ``screenPower`` key (calvin-25g9, design decision 1)."""

import pytest
from fastapi.testclient import TestClient

CONFIG_URL = "/api/config"
KIOSK = "kitchen"
OVERRIDES_URL = f"/api/kiosks/{KIOSK}/overrides"

# A screen's own schedule, distinct from the household default, so a clobber shows.
OWN_SCHEDULE = [
    {"day": 0, "enabled": True, "onTime": "08:15", "offTime": "21:45"},
    {"day": 1, "enabled": False, "onTime": "09:00", "offTime": "20:00"},
]


def _register(client: TestClient, kiosk_id: str = KIOSK) -> None:
    assert client.get(f"/api/kiosks/{kiosk_id}/config?khost=pi").status_code == 200


def _config(client: TestClient) -> dict:
    return client.get(CONFIG_URL).json()


def _kiosk_config(client: TestClient) -> dict:
    return client.get(f"/api/kiosks/{KIOSK}/config").json()


def _layer(client: TestClient) -> dict:
    return client.get(OVERRIDES_URL).json()["overrides"]


def _listed(client: TestClient) -> dict:
    return next(k for k in client.get("/api/kiosks").json()["kiosks"] if k["id"] == KIOSK)


def _mode_pair(layer: dict) -> dict:
    return {key: layer[key] for key in ("screenPower", "displayScheduleEnabled") if key in layer}


@pytest.mark.integration
def test_the_household_mode_is_derived_when_it_is_absent(test_client: TestClient):
    """Every existing install reads as before: no schedule key means Always on."""
    body = _config(test_client)
    assert body["displayScheduleEnabled"] is False
    assert body["screenPower"] == "always_on"
    test_client.post(CONFIG_URL, json={"displayScheduleEnabled": True})
    body = _config(test_client)
    assert body["displayScheduleEnabled"] is True
    assert body["screenPower"] == "schedule"


@pytest.mark.integration
def test_a_household_mode_keeps_the_switch_in_step_and_leaves_the_schedule(
    test_client: TestClient,
):
    before = _config(test_client)["displaySchedule"]
    response = test_client.post(CONFIG_URL, json={"screenPower": "external"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["screenPower"] == "external"
    assert body["displayScheduleEnabled"] is False
    assert body["displaySchedule"] == before  # never touched by a mode change
    stored = _config(test_client)
    assert stored["screen_power"] == "external"
    assert stored["display_schedule_enabled"] is False

    test_client.post(CONFIG_URL, json={"screenPower": "schedule"})
    stored = _config(test_client)
    assert stored["screenPower"] == "schedule"
    assert stored["displayScheduleEnabled"] is True
    assert stored["displaySchedule"] == before


@pytest.mark.integration
def test_an_old_page_writing_only_the_switch_sets_the_mode(test_client: TestClient):
    """A cached Settings page still writes displayScheduleEnabled; the server derives."""
    test_client.post(CONFIG_URL, json={"displayScheduleEnabled": True})
    stored = _config(test_client)
    assert stored["screenPower"] == "schedule"
    assert stored["screen_power"] == "schedule"
    test_client.post(CONFIG_URL, json={"displayScheduleEnabled": False})
    stored = _config(test_client)
    assert stored["screenPower"] == "always_on"
    assert stored["screen_power"] == "always_on"


@pytest.mark.integration
def test_the_mode_wins_when_the_household_body_carries_both(test_client: TestClient):
    test_client.post(CONFIG_URL, json={"screenPower": "always_on", "displayScheduleEnabled": True})
    stored = _config(test_client)
    assert stored["screenPower"] == "always_on"
    assert stored["displayScheduleEnabled"] is False


@pytest.mark.integration
@pytest.mark.parametrize("mode", ["always-on", "dim", "", 3, False])
def test_an_invalid_household_mode_is_422(test_client: TestClient, mode):
    assert test_client.post(CONFIG_URL, json={"screenPower": mode}).status_code == 422


@pytest.mark.integration
def test_a_screen_mode_write_keeps_the_switch_in_step(test_client: TestClient):
    _register(test_client)
    response = test_client.put(OVERRIDES_URL, json={"overrides": {"screenPower": "external"}})
    assert response.status_code == 200, response.text
    assert response.json()["overrides"] == {
        "screenPower": "external",
        "displayScheduleEnabled": False,
    }
    assert _layer(test_client) == {
        "screenPower": "external",
        "displayScheduleEnabled": False,
    }
    config = _kiosk_config(test_client)
    assert config["screenPower"] == "external"
    assert config["displayScheduleEnabled"] is False


@pytest.mark.integration
def test_a_screen_switch_write_sets_the_mode(test_client: TestClient):
    """A stale per-screen page writes displayScheduleEnabled only; the mode is derived."""
    _register(test_client)
    test_client.put(OVERRIDES_URL, json={"overrides": {"displayScheduleEnabled": True}})
    assert _layer(test_client) == {
        "screenPower": "schedule",
        "displayScheduleEnabled": True,
    }
    assert _kiosk_config(test_client)["screenPower"] == "schedule"


@pytest.mark.integration
def test_a_partial_screen_write_keeps_the_pair_in_step(test_client: TestClient):
    _register(test_client)
    test_client.patch(OVERRIDES_URL, json={"overrides": {"screenPower": "always_on"}})
    assert _mode_pair(_layer(test_client)) == {
        "screenPower": "always_on",
        "displayScheduleEnabled": False,
    }
    test_client.patch(OVERRIDES_URL, json={"overrides": {"screenPower": "schedule"}})
    assert _mode_pair(_layer(test_client)) == {
        "screenPower": "schedule",
        "displayScheduleEnabled": True,
    }
    # A partial write of the switch alone adds the derived mode too.
    test_client.patch(OVERRIDES_URL, json={"overrides": {"displayScheduleEnabled": False}})
    assert _mode_pair(_layer(test_client)) == {
        "screenPower": "always_on",
        "displayScheduleEnabled": False,
    }


@pytest.mark.integration
@pytest.mark.parametrize("verb", ["put", "patch"])
def test_an_invalid_screen_mode_is_400(test_client: TestClient, verb):
    """The override routes keep their own convention (400), not the config route's 422."""
    _register(test_client)
    response = getattr(test_client, verb)(OVERRIDES_URL, json={"overrides": {"screenPower": "dim"}})
    assert response.status_code == 400


@pytest.mark.integration
def test_a_screen_mode_never_touches_its_schedule(test_client: TestClient):
    _register(test_client)
    test_client.put(OVERRIDES_URL, json={"overrides": {"displaySchedule": OWN_SCHEDULE}})
    test_client.patch(OVERRIDES_URL, json={"overrides": {"screenPower": "external"}})
    config = _kiosk_config(test_client)
    assert config["displaySchedule"] == OWN_SCHEDULE
    test_client.patch(OVERRIDES_URL, json={"overrides": {"screenPower": "schedule"}})
    config = _kiosk_config(test_client)
    assert config["displaySchedule"] == OWN_SCHEDULE
    assert _layer(test_client)["displaySchedule"] == OWN_SCHEDULE


@pytest.mark.integration
def test_the_household_mode_reaches_a_screen_without_its_own(test_client: TestClient):
    _register(test_client)
    test_client.post(CONFIG_URL, json={"screenPower": "external"})
    config = _kiosk_config(test_client)
    assert config["screenPower"] == "external"
    # The screen's own choice wins.
    test_client.patch(OVERRIDES_URL, json={"overrides": {"screenPower": "always_on"}})
    assert _kiosk_config(test_client)["screenPower"] == "always_on"


@pytest.mark.integration
def test_an_old_layers_switch_alone_decides_the_screen_mode(test_client: TestClient):
    """A layer from before the mode existed carries only displayScheduleEnabled."""
    import asyncio

    from app.services import kiosk_registry

    _register(test_client)
    test_client.post(CONFIG_URL, json={"screenPower": "schedule"})
    # Written straight to the row, as the previous backend stored it.
    asyncio.run(kiosk_registry.set_overrides(KIOSK, {"displayScheduleEnabled": False}))

    config = _kiosk_config(test_client)
    assert config["screenPower"] == "always_on"
    assert config["displayScheduleEnabled"] is False
    view = test_client.get(f"/api/kiosks/{KIOSK}/screen-power").json()
    assert view["mode"] == "always_on"
    assert _listed(test_client)["screenPower"] == "always_on"
    # The mode is in force: Always on refuses a command.
    assert (
        test_client.put(f"/api/kiosks/{KIOSK}/screen-power", json={"power": "off"}).status_code
        == 409
    )
