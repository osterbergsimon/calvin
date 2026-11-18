"""The screen-power route and the held on/off in the kiosk config (calvin-2ifv)."""

import pytest
from fastapi.testclient import TestClient
from loguru import logger

KIOSK = "kitchen"
URL = f"/api/kiosks/{KIOSK}/screen-power"


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
