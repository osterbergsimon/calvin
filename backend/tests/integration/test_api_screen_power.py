"""The screen-power route and its command in the kiosk config (calvin-2ifv, calvin-25g9)."""

import asyncio
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from loguru import logger

KIOSK = "kitchen"
URL = f"/api/kiosks/{KIOSK}/screen-power"
OVERRIDES_URL = f"/api/kiosks/{KIOSK}/overrides"

# All days off: the schedule says "on" and has no boundary, so a test that does
# not care about the schedule is not tied to the time of day.
NO_SCHEDULE = [
    {"day": day, "enabled": False, "onTime": "07:00", "offTime": "22:00"} for day in range(7)
]
# All days on 07:00-22:00: the expiry tests use its boundaries.
SCHEDULE = [
    {"day": day, "enabled": True, "onTime": "07:00", "offTime": "22:00"} for day in range(7)
]


@pytest.fixture(autouse=True)
def _fresh_limiter():
    from app.services.screen_power import change_limiter

    change_limiter.reset()
    yield
    change_limiter.reset()


def _set_mode(client: TestClient, mode: str = "schedule") -> None:
    body: dict = {"screenPower": mode}
    if mode == "schedule":
        body["displaySchedule"] = NO_SCHEDULE
    assert client.post("/api/config", json=body).status_code == 200


def _register(
    client: TestClient,
    kiosk_id: str = KIOSK,
    query: str = "kagent=v1",
    mode: str | None = "schedule",
) -> None:
    """Register a screen; unless ``mode`` is None, the household uses that mode."""
    if mode is not None:
        _set_mode(client, mode)
    assert client.get(f"/api/kiosks/{kiosk_id}/config?{query}").status_code == 200


def _limited_key(client: TestClient, name: str = "Homey") -> str:
    response = client.post(
        "/api/auth/keys",
        json={"name": name, "scope": "read", "permissions": ["screens.power"]},
    )
    assert response.status_code == 201, response.text
    return response.json()["secret"]


def _listed(client: TestClient, kiosk_id: str = KIOSK) -> dict:
    return next(k for k in client.get("/api/kiosks").json()["kiosks"] if k["id"] == kiosk_id)


def _stored_command(kiosk_id: str = KIOSK) -> dict | None:
    from app.models.db_models import KioskDB

    row = asyncio.run(KioskDB.objects.get(id=kiosk_id))
    return dict(row.power_hold) if row.power_hold is not None else None


def _set_command(power: str, mode: str, when: datetime, kiosk_id: str = KIOSK) -> None:
    from app.services.kiosk_registry import set_power_command

    asyncio.run(set_power_command(kiosk_id, power, "automation", mode, now=when))


@pytest.mark.integration
def test_put_off_stores_the_command_and_projects_screen_now(test_client: TestClient):
    _register(test_client)
    response = test_client.put(URL, json={"power": "off"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["id"] == KIOSK
    assert body["power"] == "off" and body["held"] is True and body["by"] == "settings"
    assert body["desiredOn"] is False and body["online"] is True
    assert body["agentHolds"] is False  # this agent did not report kfeat=hold
    assert body["setAt"].endswith("Z")
    assert test_client.get(URL).json() == body

    config = test_client.get(f"/api/kiosks/{KIOSK}/config").json()
    expected = {"power": "off", "setAt": body["setAt"]}
    assert config["screenNow"] == config["screen_now"] == expected
    assert "screenNow" not in test_client.get(OVERRIDES_URL).json()["overrides"]
    assert _stored_command()["mode"] == "schedule"
    assert _stored_command()["by"] == "settings"


@pytest.mark.integration
def test_schedule_clears_the_command(test_client: TestClient):
    _register(test_client)
    test_client.put(URL, json={"power": "off"})
    body = test_client.put(URL, json={"power": "schedule"}).json()
    assert body["power"] == "schedule" and body["held"] is False and body["setAt"] is None
    assert body["desiredOn"] is True  # no schedule: on
    assert _stored_command() is None
    config = test_client.get(f"/api/kiosks/{KIOSK}/config").json()
    assert "screenHold" not in config and "screenNow" not in config


@pytest.mark.integration
def test_unknown_screen_is_404_and_creates_nothing(test_client: TestClient):
    assert (
        test_client.put("/api/kiosks/ghost/screen-power", json={"power": "off"}).status_code == 404
    )
    assert test_client.get("/api/kiosks/ghost/screen-power").status_code == 404
    assert test_client.get("/api/kiosks").json()["kiosks"] == []


@pytest.mark.integration
@pytest.mark.parametrize("body", [{"power": "dim"}, {}, {"power": None}, {"power": "OFF"}])
def test_bad_body_is_422(test_client: TestClient, body):
    _register(test_client)
    assert test_client.put(URL, json=body).status_code == 422


@pytest.mark.integration
def test_bad_id_is_400(test_client: TestClient):
    assert (
        test_client.put("/api/kiosks/bad%20id/screen-power", json={"power": "on"}).status_code
        == 400
    )


@pytest.mark.integration
def test_no_change_writes_nothing_and_is_not_limited(test_client: TestClient, monkeypatch):
    _register(test_client)
    test_client.put(URL, json={"power": "off"})
    first = test_client.get(URL).json()
    from app.services import kiosk_registry

    calls = []
    original = kiosk_registry.set_power_command

    async def counting(*args, **kwargs):
        calls.append(args)
        return await original(*args, **kwargs)

    monkeypatch.setattr(kiosk_registry, "set_power_command", counting)
    for _ in range(40):
        assert test_client.put(URL, json={"power": "off"}).status_code == 200
    assert calls == []
    assert test_client.get(URL).json()["setAt"] == first["setAt"]
    # schedule with nothing to clear is a no-op too.
    test_client.put(URL, json={"power": "schedule"})
    for _ in range(40):
        assert test_client.put(URL, json={"power": "schedule"}).status_code == 200


@pytest.mark.integration
def test_changes_are_limited_per_caller(test_client: TestClient):
    _register(test_client)
    codes = [
        test_client.put(URL, json={"power": "off" if i % 2 else "on"}).status_code
        for i in range(31)
    ]
    assert codes[:30] == [200] * 30
    assert codes[30] == 429
    limited = test_client.put(URL, json={"power": "schedule"})
    assert limited.status_code == 429
    assert limited.json()["detail"]["code"] == "rate_limited"
    assert int(limited.headers["Retry-After"]) >= 1


@pytest.mark.integration
def test_limited_key_switches_and_is_logged_by_name(test_client: TestClient):
    _register(test_client)
    secret = _limited_key(test_client)
    test_client.cookies.clear()
    sink: list[str] = []
    handler = logger.add(lambda message: sink.append(str(message)), level="DEBUG")
    try:
        response = test_client.put(
            URL, json={"power": "off"}, headers={"Authorization": f"Bearer {secret}"}
        )
    finally:
        logger.remove(handler)
    assert response.status_code == 200, response.text
    assert response.json()["by"] == "automation"
    joined = "\n".join(sink)
    assert "Homey" in joined and KIOSK in joined
    assert secret not in joined
    # The command keeps the key's name; no public view carries it.
    assert _stored_command()["keyName"] == "Homey"
    for path in (
        URL,
        "/api/kiosks",
        f"/api/kiosks/{KIOSK}/config",
        f"/api/kiosks/{KIOSK}/overrides",
    ):
        assert "Homey" not in test_client.get(path).text, path
    # Homey can read the state with the same key.
    read = test_client.get(URL, headers={"Authorization": f"Bearer {secret}"})
    assert read.status_code == 200 and read.json()["power"] == "off"


@pytest.mark.integration
def test_limited_key_cannot_replace_the_layer(test_client: TestClient):
    _register(test_client)
    secret = _limited_key(test_client)
    test_client.cookies.clear()
    response = test_client.put(
        OVERRIDES_URL,
        json={"overrides": {}},
        headers={"Authorization": f"Bearer {secret}"},
    )
    assert response.status_code == 403


@pytest.mark.integration
@pytest.mark.parametrize("verb", ["put", "patch"])
def test_a_layer_write_strips_screen_now(test_client: TestClient, verb):
    """Settings no longer writes a Screen now into the layer; both writes drop one."""
    _register(test_client)
    stale = {
        "displayName": "Kitchen",
        "screenNow": {"power": "on", "setAt": "2026-11-18T09:00:00Z"},
        "screen_now": {"power": "off", "setAt": "2026-11-18T09:00:00Z"},
    }
    response = getattr(test_client, verb)(OVERRIDES_URL, json={"overrides": stale})
    assert response.status_code == 200, response.text
    layer = test_client.get(OVERRIDES_URL).json()["overrides"]
    assert "screenNow" not in layer and "screen_now" not in layer
    assert layer["displayName"] == "Kitchen"
    assert "screenNow" not in response.json()["overrides"]


@pytest.mark.integration
def test_an_expired_command_reads_as_schedule_without_a_write(test_client: TestClient):
    """Decision 4: a passed boundary makes the command absent, and a read keeps it."""
    _register(test_client)
    test_client.post("/api/config", json={"screenPower": "schedule", "displaySchedule": SCHEDULE})
    _set_command("off", "schedule", datetime(2026, 1, 1, 12, tzinfo=UTC))
    stored_before = _stored_command()
    assert stored_before["power"] == "off"

    body = test_client.get(URL).json()
    assert (body["power"], body["held"], body["setAt"], body["by"]) == (
        "schedule",
        False,
        None,
        None,
    )
    assert _stored_command() == stored_before  # nothing was cleared on the read

    # The next command write replaces it.
    assert test_client.put(URL, json={"power": "on"}).json()["power"] == "on"
    assert _stored_command()["power"] == "on"


@pytest.mark.integration
def test_a_command_from_another_mode_is_absent(test_client: TestClient):
    """Decision 5: changing the mode ends the command, with no write on the read."""
    _register(test_client)
    _set_command("off", "schedule", datetime.now(UTC))
    stored_before = _stored_command()
    test_client.post("/api/config", json={"screenPower": "external"})
    body = test_client.get(URL).json()
    assert (body["power"], body["held"], body["setAt"], body["by"]) == (
        "schedule",
        False,
        None,
        None,
    )
    assert body["desiredOn"] is True  # External without a command means on
    assert _stored_command() == stored_before

    # The next write in External starts a fresh command.
    assert test_client.put(URL, json={"power": "off"}).status_code == 200
    assert _stored_command()["mode"] == "external"


@pytest.mark.integration
def test_a_cleared_command_leaves_nothing_for_readers_or_agents(test_client: TestClient):
    _register(test_client, query="kagent=v1")  # an agent that cannot hold
    test_client.put(URL, json={"power": "off"})
    assert test_client.put(URL, json={"power": "schedule"}).status_code == 200

    listed = _listed(test_client)
    assert listed["powerHold"] is None
    for key in ("screenNow", "screen_now"):
        assert key not in listed["overrides"], key
    view = test_client.get(URL).json()
    assert (view["power"], view["held"], view["setAt"], view["by"]) == (
        "schedule",
        False,
        None,
        None,
    )
    config = test_client.get(f"/api/kiosks/{KIOSK}/config").json()
    for key in ("screenHold", "screen_hold", "screenNow", "screen_now"):
        assert key not in config, key
    assert view["desiredOn"] is True


@pytest.mark.integration
def test_agent_reports_it_can_hold(test_client: TestClient):
    _register(test_client, query="kagent=v2&kfeat=hold")
    assert _listed(test_client)["agentHolds"] is True
    assert test_client.put(URL, json={"power": "on"}).json()["agentHolds"] is True


@pytest.mark.integration
@pytest.mark.no_admin_login
def test_anonymous_cannot_switch_but_can_read(test_client: TestClient):
    _register(test_client, mode=None)
    response = test_client.put(URL, json={"power": "off"})
    assert response.status_code == 401
    assert test_client.get(URL).status_code == 200


@pytest.mark.integration
def test_a_hold_written_into_the_layer_is_ignored(test_client: TestClient):
    """Only the command column switches a screen: a layer (or a restored backup) cannot."""
    _register(test_client)
    injected = {"screenHold": {"power": "off", "setAt": "2026-11-18T12:00:00Z"}}
    test_client.put(OVERRIDES_URL, json={"overrides": injected})
    config = test_client.get(f"/api/kiosks/{KIOSK}/config").json()
    assert "screenHold" not in config and "screen_hold" not in config
    body = test_client.get(URL).json()
    assert body["held"] is False and body["desiredOn"] is True


@pytest.mark.integration
def test_old_agent_desired_on_follows_the_projected_screen_now(test_client: TestClient):
    """For an agent that can't hold, desiredOn is what that agent will do."""
    _register(test_client)  # kagent without kfeat: cannot hold
    test_client.post("/api/config", json={"screenPower": "schedule", "displaySchedule": SCHEDULE})
    _set_command("off", "schedule", datetime(2026, 1, 1, tzinfo=UTC))
    body = test_client.get(URL).json()
    # Expired long ago: absent, the schedule says on.
    assert body["held"] is False and body["desiredOn"] is True

    _set_command("off", "schedule", datetime.now(UTC))
    body = test_client.get(URL).json()
    assert body["held"] is True and body["agentHolds"] is False
    assert body["desiredOn"] is False


# -- what a command means per mode (design decision 3) ----------------------


@pytest.mark.integration
def test_always_on_refuses_a_command_with_the_exact_answer(test_client: TestClient):
    _register(test_client, mode="always_on")
    for power in ("on", "off"):
        response = test_client.put(URL, json={"power": power})
        assert response.status_code == 409
        assert response.json()["detail"] == {
            "code": "screen_power_always_on",
            "message": "This screen is set to Always on. Choose Schedule or External to switch it.",
        }
    assert _stored_command() is None
    body = test_client.get(URL).json()
    assert body["power"] == "schedule" and body["held"] is False
    assert body["desiredOn"] is True


@pytest.mark.integration
def test_always_on_schedule_is_a_noop(test_client: TestClient, monkeypatch):
    _register(test_client, mode="always_on")
    from app.services import kiosk_registry

    def refuse(*args, **kwargs):
        raise AssertionError("a no-op must not write")

    monkeypatch.setattr(kiosk_registry, "clear_power_command", refuse)
    monkeypatch.setattr(kiosk_registry, "set_power_command", refuse)
    for _ in range(5):
        assert test_client.put(URL, json={"power": "schedule"}).status_code == 200


@pytest.mark.integration
def test_external_takes_on_and_off(test_client: TestClient):
    _register(test_client, mode="external")
    body = test_client.get(URL).json()
    # No command yet in External: the UI reads "schedule" as no command, and on.
    assert body["power"] == "schedule" and body["held"] is False
    assert body["desiredOn"] is True

    assert test_client.put(URL, json={"power": "off"}).json()["power"] == "off"
    assert _stored_command()["mode"] == "external"
    assert test_client.get(URL).json()["power"] == "off"
    assert test_client.put(URL, json={"power": "on"}).json()["power"] == "on"
    assert _stored_command()["mode"] == "external"


@pytest.mark.integration
def test_external_refuses_schedule_with_the_exact_answer(test_client: TestClient):
    _register(test_client, mode="external")
    test_client.put(URL, json={"power": "off"})
    response = test_client.put(URL, json={"power": "schedule"})
    assert response.status_code == 409
    assert response.json()["detail"] == {
        "code": "screen_power_external",
        "message": "This screen is set to External. Send on or off.",
    }
    assert _stored_command()["power"] == "off"  # nothing was cleared


@pytest.mark.integration
def test_a_refused_change_does_not_count_toward_the_limit(test_client: TestClient):
    _register(test_client, mode="always_on")
    for _ in range(40):
        assert test_client.put(URL, json={"power": "off"}).status_code == 409
    # The limiter was not touched by the refusals.
    _set_mode(test_client, "external")
    assert test_client.put(URL, json={"power": "off"}).status_code == 200
