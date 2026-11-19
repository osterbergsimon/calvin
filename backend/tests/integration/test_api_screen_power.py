"""The screen-power route and the held on/off in the kiosk config (calvin-2ifv)."""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from loguru import logger

KIOSK = "kitchen"
URL = f"/api/kiosks/{KIOSK}/screen-power"
OVERRIDES_URL = f"/api/kiosks/{KIOSK}/overrides"


@pytest.fixture(autouse=True)
def _fresh_limiter():
    from app.services.screen_power import change_limiter

    change_limiter.reset()
    yield
    change_limiter.reset()


def _register(client: TestClient, kiosk_id: str = KIOSK, query: str = "kagent=v1") -> None:
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


def _client_choice(power: str, offset_s: float) -> dict:
    """A "Screen now" as a phone would stamp it: browser clock, ISO-8601 with ms."""
    return {"power": power, "setAt": (datetime.now(UTC) + timedelta(seconds=offset_s)).isoformat()}


def _assert_restamped_now(stored: dict, sent: dict) -> None:
    """The choice was kept, and its setAt now carries the server's clock, not the phone's."""
    assert stored["setAt"] != sent["setAt"]
    assert stored["setAt"].endswith("Z")
    stamped = datetime.fromisoformat(stored["setAt"].replace("Z", "+00:00"))
    assert abs((datetime.now(UTC) - stamped).total_seconds()) < 10


@pytest.mark.integration
def test_put_off_holds_and_projects(test_client: TestClient):
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
    assert config["screenHold"] == config["screen_hold"] == expected
    assert config["screenNow"] == config["screen_now"] == expected
    assert "screenNow" not in test_client.get(f"/api/kiosks/{KIOSK}/overrides").json()["overrides"]
    assert _listed(test_client)["powerHold"]["power"] == "off"


@pytest.mark.integration
def test_schedule_ends_the_hold(test_client: TestClient):
    _register(test_client)
    test_client.put(URL, json={"power": "off"})
    body = test_client.put(URL, json={"power": "schedule"}).json()
    assert body["power"] == "schedule" and body["held"] is False and body["setAt"] is None
    assert body["desiredOn"] is True  # no schedule: on
    config = test_client.get(f"/api/kiosks/{KIOSK}/config").json()
    assert "screenHold" not in config and "screenNow" not in config


@pytest.mark.integration
def test_schedule_clears_a_manual_screen_now(test_client: TestClient):
    _register(test_client)
    test_client.patch(
        f"/api/kiosks/{KIOSK}/overrides",
        json={"overrides": {"screenNow": {"power": "off", "setAt": "2026-11-18T10:00:00Z"}}},
    )
    test_client.put(URL, json={"power": "schedule"})
    layer = test_client.get(f"/api/kiosks/{KIOSK}/overrides").json()["overrides"]
    assert "screenNow" not in layer


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
    original = kiosk_registry.set_power_hold

    async def counting(*args, **kwargs):
        calls.append(args)
        return await original(*args, **kwargs)

    monkeypatch.setattr(kiosk_registry, "set_power_hold", counting)
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
    # No public view carries the key's name.
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
        f"/api/kiosks/{KIOSK}/overrides",
        json={"overrides": {}},
        headers={"Authorization": f"Bearer {secret}"},
    )
    assert response.status_code == 403


@pytest.mark.integration
def test_stale_settings_save_cannot_bring_back_screen_now(test_client: TestClient):
    _register(test_client)
    test_client.put(URL, json={"power": "off"})
    stale = {
        "displayName": "Kitchen",
        "screenNow": {"power": "on", "setAt": "2026-11-18T09:00:00Z"},
    }
    assert (
        test_client.put(f"/api/kiosks/{KIOSK}/overrides", json={"overrides": stale}).status_code
        == 200
    )
    layer = test_client.get(f"/api/kiosks/{KIOSK}/overrides").json()["overrides"]
    assert layer == {"displayName": "Kitchen"}
    assert test_client.get(URL).json()["power"] == "off"


@pytest.mark.integration
def test_a_screen_now_older_than_the_last_power_change_is_dropped(test_client: TestClient):
    """The stale-page probe from the PR #369 review (calvin-ldeu).

    A page that missed a whole hold (set and cleared between two of its
    kiosk-list refreshes) must not put its old manual choice back.
    """
    _register(test_client)
    stale = {
        "displayName": "Kitchen",
        "screenNow": {"power": "off", "setAt": "2026-01-01T00:00:00Z"},
    }
    assert test_client.put(OVERRIDES_URL, json={"overrides": stale}).status_code == 200
    # Home automation holds the screen on, then sends it back to its schedule,
    # both between two kiosk-list refreshes, so the page never sees the hold.
    assert test_client.put(URL, json={"power": "on"}).status_code == 200
    assert test_client.put(URL, json={"power": "schedule"}).status_code == 200
    assert test_client.get(URL).json()["held"] is False
    # The person saves an unrelated field; the page resends its whole layer.
    assert test_client.put(OVERRIDES_URL, json={"overrides": stale}).status_code == 200
    layer = test_client.get(OVERRIDES_URL).json()["overrides"]
    assert layer == {"displayName": "Kitchen"}
    view = test_client.get(URL).json()
    assert view["power"] == "schedule" and view["desiredOn"] is True


@pytest.mark.integration
def test_a_fresh_screen_now_after_the_change_is_kept(test_client: TestClient):
    """A person's own "Turn off now" after a hold ended still works (PUT)."""
    _register(test_client)
    test_client.put(URL, json={"power": "on"})
    test_client.put(URL, json={"power": "schedule"})
    fresh = _client_choice("off", offset_s=0)
    response = test_client.put(OVERRIDES_URL, json={"overrides": {"screenNow": fresh}})
    assert response.status_code == 200, response.text
    stored = test_client.get(OVERRIDES_URL).json()["overrides"]["screenNow"]
    assert stored["power"] == "off"
    _assert_restamped_now(stored, fresh)
    assert test_client.get(URL).json()["desiredOn"] is False
    assert test_client.get(f"/api/kiosks/{KIOSK}/config").json()["screenNow"] == stored


@pytest.mark.integration
@pytest.mark.parametrize("offset_s", [-5, 5])
def test_put_keeps_a_fresh_choice_when_the_client_clock_is_off(
    test_client: TestClient, offset_s: int
):
    """The page stamps setAt with the browser clock; the server judges with its own.

    Ending a hold writes the tombstone on the server, and the page saves the new
    choice milliseconds later. A phone a few seconds behind (or ahead) must not
    have that press silently dropped because its clock disagrees (calvin-ldeu).
    """
    _register(test_client)
    test_client.put(URL, json={"power": "on"})
    test_client.put(URL, json={"power": "schedule"})
    choice = _client_choice("off", offset_s=offset_s)
    response = test_client.put(OVERRIDES_URL, json={"overrides": {"screenNow": choice}})
    assert response.status_code == 200, response.text
    stored = response.json()["overrides"]["screenNow"]
    assert stored["power"] == "off"
    _assert_restamped_now(stored, choice)
    assert test_client.get(URL).json()["desiredOn"] is False


@pytest.mark.integration
@pytest.mark.parametrize("offset_s", [-5, 5])
def test_patch_keeps_a_fresh_choice_when_the_client_clock_is_off(
    test_client: TestClient, offset_s: int
):
    """The screen's own partial write (PATCH) gets the same clock tolerance."""
    _register(test_client)
    test_client.put(URL, json={"power": "on"})
    test_client.put(URL, json={"power": "schedule"})
    choice = _client_choice("off", offset_s=offset_s)
    response = test_client.patch(OVERRIDES_URL, json={"overrides": {"screenNow": choice}})
    assert response.status_code == 200, response.text
    stored = response.json()["overrides"]["screenNow"]
    assert stored["power"] == "off"
    _assert_restamped_now(stored, choice)
    assert test_client.get(URL).json()["desiredOn"] is False


@pytest.mark.integration
def test_a_choice_beyond_the_tolerance_in_the_future_is_not_restamped(test_client: TestClient):
    """Far ahead is not "fresh now": no re-stamp, and the old rule still applies."""
    _register(test_client)
    test_client.put(URL, json={"power": "on"})
    test_client.put(URL, json={"power": "schedule"})
    ahead = _client_choice("off", offset_s=3600)
    response = test_client.put(OVERRIDES_URL, json={"overrides": {"screenNow": ahead}})
    assert response.status_code == 200, response.text
    # Strictly newer than the change: kept exactly as sent.
    assert response.json()["overrides"]["screenNow"] == ahead


@pytest.mark.integration
def test_patch_drops_a_superseded_screen_now(test_client: TestClient):
    """A screen's own partial write (PATCH) is guarded the same way."""
    _register(test_client)
    test_client.put(URL, json={"power": "on"})
    test_client.put(URL, json={"power": "schedule"})
    stale = {"power": "off", "setAt": "2026-01-01T00:00:00Z"}
    response = test_client.patch(OVERRIDES_URL, json={"overrides": {"screenNow": stale}})
    assert response.status_code == 200, response.text
    assert "screenNow" not in response.json()["overrides"]
    assert "screenNow" not in test_client.get(OVERRIDES_URL).json()["overrides"]


@pytest.mark.integration
def test_patch_keeps_a_fresh_screen_now(test_client: TestClient):
    _register(test_client)
    test_client.put(URL, json={"power": "on"})
    test_client.put(URL, json={"power": "schedule"})
    fresh = _client_choice("on", offset_s=0)
    response = test_client.patch(OVERRIDES_URL, json={"overrides": {"screenNow": fresh}})
    assert response.status_code == 200, response.text
    _assert_restamped_now(response.json()["overrides"]["screenNow"], fresh)


@pytest.mark.integration
def test_back_to_schedule_also_supersedes_a_lone_screen_now(test_client: TestClient):
    """Ending a plain "Screen now" (no hold) is a power change too."""
    _register(test_client)
    manual = {"power": "on", "setAt": "2026-01-01T00:00:00Z"}
    test_client.put(OVERRIDES_URL, json={"overrides": {"screenNow": manual}})
    test_client.put(URL, json={"power": "schedule"})
    assert "screenNow" not in test_client.get(OVERRIDES_URL).json()["overrides"]
    # A page that still carries the removed choice cannot put it back.
    test_client.put(OVERRIDES_URL, json={"overrides": {"screenNow": manual}})
    assert "screenNow" not in test_client.get(OVERRIDES_URL).json()["overrides"]


@pytest.mark.integration
def test_a_cleared_hold_leaves_nothing_for_readers_or_agents(test_client: TestClient):
    """The tombstone that keeps the guard is never a hold and never a config key."""
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
    _register(test_client)
    response = test_client.put(URL, json={"power": "off"})
    assert response.status_code == 401
    assert test_client.get(URL).status_code == 200


@pytest.mark.integration
def test_a_hold_written_into_the_layer_is_ignored(test_client: TestClient):
    """Only the hold column holds a screen: a layer (or a restored backup) cannot."""
    _register(test_client)
    injected = {"screenHold": {"power": "off", "setAt": "2026-11-18T12:00:00Z"}}
    test_client.put(f"/api/kiosks/{KIOSK}/overrides", json={"overrides": injected})
    config = test_client.get(f"/api/kiosks/{KIOSK}/config").json()
    assert "screenHold" not in config and "screen_hold" not in config
    body = test_client.get(URL).json()
    assert body["held"] is False and body["desiredOn"] is True


@pytest.mark.integration
def test_old_agent_desired_on_follows_the_projected_screen_now(test_client: TestClient):
    """For an agent that can't hold, desiredOn is what that agent will do."""
    _register(test_client)  # kagent without kfeat: cannot hold
    test_client.post(
        "/api/config",
        json={
            "displayScheduleEnabled": True,
            "displaySchedule": [
                {"day": d, "enabled": True, "onTime": "00:00", "offTime": "23:59"} for d in range(7)
            ],
        },
    )
    from app.services import kiosk_registry

    async def _old_hold():
        from datetime import UTC, datetime

        await kiosk_registry.set_power_hold(
            KIOSK, "off", "automation", now=datetime(2026, 1, 1, tzinfo=UTC)
        )

    import asyncio

    asyncio.run(_old_hold())
    body = test_client.get(URL).json()
    assert body["held"] is True and body["agentHolds"] is False
    # Set long ago: the old agent's projected screenNow has expired, the schedule says on.
    assert body["desiredOn"] is True
