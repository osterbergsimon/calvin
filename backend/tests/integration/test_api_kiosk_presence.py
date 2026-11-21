"""Only the screen itself and admin see a gated screen's presence (calvin-0xns, Task 5)."""

import asyncio
import time

import pytest
from fastapi.testclient import TestClient

from app.security.admin_auth import COOKIE_NAME
from app.security.kiosk_auth import KIOSK_COOKIE, issue_kiosk_cookie
from app.services import display_check, kiosk_registry
from app.services.config_service import config_service
from app.services.kiosk_pairing import hash_secret, new_secret, pairing_store
from app.services.kiosk_view import PRESENCE_KEYS

CONFIG_PRESENCE_KEYS = tuple(key for key in PRESENCE_KEYS if key != "powerHold")
KIOSK = "kitchen"
CONFIG_URL = f"/api/kiosks/{KIOSK}/config"
LIST_URL = "/api/kiosks"
OVERRIDES_URL = f"/api/kiosks/{KIOSK}/overrides"
POWER_URL = f"/api/kiosks/{KIOSK}/screen-power"


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@pytest.fixture(autouse=True)
def _clean_pairing_store():
    pairing_store._pending.clear()
    pairing_store._install_codes.clear()
    pairing_store._new_by_address.clear()
    kiosk_registry.browser_seen.clear()
    getattr(kiosk_registry, "auth_peer_ips", {}).clear()
    getattr(kiosk_registry, "agent_polls", {}).clear()
    yield
    pairing_store._pending.clear()
    pairing_store._install_codes.clear()
    pairing_store._new_by_address.clear()
    kiosk_registry.browser_seen.clear()
    getattr(kiosk_registry, "auth_peer_ips", {}).clear()
    getattr(kiosk_registry, "agent_polls", {}).clear()


@pytest.fixture(autouse=True)
def _no_migrations(monkeypatch):
    """A new row must not adopt household keys behind these tests' backs."""

    async def no_op():
        return None

    for module in ("app.services.kiosk_registry", "app.api.routes.kiosks"):
        monkeypatch.setattr(f"{module}._adopt_global_settings", no_op, raising=False)


def _set_mode(mode: str) -> None:
    if mode == "required":
        _run(config_service.set_value("kioskPairing", "required"))
    else:
        _run(config_service.delete_value("kioskPairing"))


def _register_unpaired(kiosk_id: str = KIOSK) -> None:
    _run(
        kiosk_registry.record_kiosk(
            kiosk_id,
            hostname="pi-kitchen",
            agent_version="v1",
            agent_features="hold,pair",
            peer_ip="10.0.0.2",
        )
    )


def _pair(kiosk_id: str = KIOSK) -> str:
    secret = new_secret()
    _run(kiosk_registry.set_credential(kiosk_id, hash_secret(secret)))
    return secret


def _hold() -> None:
    """A command in force: External mode, so it stands and is projected."""
    _run(config_service.set_value("screen_power", "external"))
    _run(config_service.set_value("display_schedule_enabled", False))
    _run(kiosk_registry.set_power_command(KIOSK, "off", "settings", mode="external"))


def _legacy_screen_now() -> None:
    """A layer written by Settings before the command column existed (calvin-25g9)."""
    from app.models.db_models import KioskDB

    async def _write() -> None:
        row = await KioskDB.objects.get(id=KIOSK)
        row.overrides = {
            **(row.overrides or {}),
            "_agentUpdateRequested": True,
            "screenNow": {"power": "off", "setAt": "2026-11-18T09:00:00Z"},
        }
        await row.update(_columns=["overrides"])

    _run(_write())


def _display_check() -> None:
    _run(display_check.start_run(KIOSK, display_check.StartRequest(step="detect")))


def _credentials(client: TestClient, *, paired: bool) -> dict[str, dict]:
    """The callers from the plan's matrix, with the credential each one carries."""
    admin_cookie = client.cookies.get(COOKIE_NAME)
    assert admin_cookie
    client.cookies.clear()
    secret = _pair() if paired else new_secret()
    if paired:
        cookie = issue_kiosk_cookie(KIOSK, _run(kiosk_registry.get_credential_hash(KIOSK)))
    else:
        cookie = issue_kiosk_cookie(KIOSK, hash_secret(secret))
    pending_secret = new_secret()
    pairing_store.start(KIOSK, hash_secret(pending_secret), "10.0.0.2")
    return {
        "anonymous": ({}, None, False),
        "bad_bearer": (
            {"Authorization": f"Bearer clv_kiosk_{'a' * 43}"},
            None,
            False,
        ),
        "pending_bearer": ({"Authorization": f"Bearer {pending_secret}"}, None, False),
        "own_bearer": ({"Authorization": f"Bearer {secret}"}, KIOSK, False),
        "own_cookie": ({"cookie": f"{KIOSK_COOKIE}={cookie}"}, KIOSK, False),
        "admin": ({"cookie": f"{COOKIE_NAME}={admin_cookie}"}, None, True),
    }


@pytest.mark.integration
@pytest.mark.parametrize("mode", ["optional", "required"])
@pytest.mark.parametrize("paired", [False, True])
@pytest.mark.parametrize(
    "caller", ["anonymous", "bad_bearer", "pending_bearer", "own_bearer", "own_cookie", "admin"]
)
def test_config_read_always_200_and_presence_matches_the_table(
    test_client: TestClient, mode: str, paired: bool, caller: str
):
    if caller in ("own_bearer", "own_cookie") and not paired:
        pytest.skip("an unpaired screen has no active secret to name it")
    _set_mode(mode)
    if paired:
        _pair()
    else:
        _register_unpaired()
    _hold()
    _display_check()
    headers, principal, admin = _credentials(test_client, paired=paired)[caller]

    response = test_client.get(CONFIG_URL, headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    # The dashboard always keeps its layout and rotation (anti-goal: never blank).
    assert "orientation" in body
    assert "applyDisplayRotation" in body
    assert "dashboardLayout" in body

    visible = admin or principal == KIOSK or not (paired or mode == "required")
    for key in CONFIG_PRESENCE_KEYS:
        assert (key in body) is visible, key
    assert (body.get("presenceHidden") is True) is (not visible)

    auth = body["kioskAuth"]
    assert auth["state"] == ("paired" if principal == KIOSK else "unpaired")
    assert auth["mode"] == mode
    assert auth["hasAgent"] is True
    assert ("browser" in auth) is (principal == KIOSK)


@pytest.mark.integration
@pytest.mark.parametrize("mode", ["optional", "required"])
@pytest.mark.parametrize("paired", [False, True])
def test_list_and_overrides_hide_presence_per_row(test_client: TestClient, mode, paired):
    _set_mode(mode)
    _register_unpaired()
    if paired:
        _pair()
    _hold()
    _legacy_screen_now()
    headers, principal, admin = _credentials(test_client, paired=paired)["anonymous"]

    listed = test_client.get(LIST_URL, headers=headers)
    assert listed.status_code == 200
    assert listed.headers["cache-control"] == "private, no-cache"
    assert "Cookie" in listed.headers["vary"] and "Authorization" in listed.headers["vary"]
    row = next(k for k in listed.json()["kiosks"] if k["id"] == KIOSK)
    visible = admin or principal == KIOSK or not (paired or mode == "required")
    assert ("powerHold" in row) is visible
    assert ("screenPower" in row) is visible
    assert ("displayCheckActive" in row) is visible
    assert (row.get("presenceHidden") is True) is (not visible)
    # Never hidden: the evidence Settings needs to explain the screen.
    assert row["lastSeen"] is not None
    assert row["agentHolds"] is True
    assert row["agentPairs"] is True
    assert "displayCheck" in row
    assert "screenNow" in row["overrides"] or "screen_now" in row["overrides"] or not visible

    overrides = test_client.get(OVERRIDES_URL, headers=headers)
    assert overrides.status_code == 200
    layer = overrides.json()["overrides"]
    assert ("screenNow" in layer or "screen_now" in layer) is visible
    assert (overrides.json().get("presenceHidden") is True) is (not visible)

    # The PATCH answer (a screen's own "Hide controls" write, open to anyone)
    # goes through the same projection, and never the host-internal flag.
    patched = test_client.patch(
        OVERRIDES_URL, headers=headers, json={"overrides": {"showUI": True}}
    )
    assert patched.status_code == 200, patched.text
    answer = patched.json()
    patched_layer = answer["overrides"]
    assert "_agentUpdateRequested" not in patched_layer
    # A layer write strips the legacy Screen now, so it is gone for everyone.
    assert "screenNow" not in patched_layer and "screen_now" not in patched_layer
    assert (answer.get("presenceHidden") is True) is (not visible)


@pytest.mark.integration
def test_a_kiosk_cookie_unlocks_only_its_own_row(test_client: TestClient):
    _run(config_service.set_value("screen_power", "external"))
    _run(config_service.set_value("display_schedule_enabled", False))
    for kiosk_id in ("kitchen", "hall"):
        _pair(kiosk_id)
        _run(kiosk_registry.record_kiosk(kiosk_id, agent_version="v1"))
        _run(kiosk_registry.set_power_command(kiosk_id, "off", "settings", mode="external"))
    cookie = issue_kiosk_cookie("kitchen", _run(kiosk_registry.get_credential_hash("kitchen")))
    test_client.cookies.clear()

    rows = test_client.get(LIST_URL, headers={"cookie": f"{KIOSK_COOKIE}={cookie}"}).json()[
        "kiosks"
    ]
    kitchen = next(k for k in rows if k["id"] == "kitchen")
    hall = next(k for k in rows if k["id"] == "hall")
    assert kitchen["powerHold"]["power"] == "off"
    assert "powerHold" not in hall
    assert hall["presenceHidden"] is True


@pytest.mark.integration
@pytest.mark.parametrize("mode", ["optional", "required"])
def test_screen_power_of_a_gated_screen_needs_admin_power_key_or_the_screen(test_client, mode):
    _set_mode(mode)
    _register_unpaired()
    # Optional and unpaired is not gated: it stays public, as today.
    if mode == "optional":
        assert test_client.get(POWER_URL).status_code == 200
        return

    admin_cookie = test_client.cookies.get(COOKIE_NAME)
    test_client.cookies.clear()
    anonymous = test_client.get(POWER_URL)
    assert anonymous.status_code == 401
    assert anonymous.json()["detail"]["code"] == "admin_required"

    # Re-sign in to mint the two keys.
    assert (
        test_client.post("/api/auth/login", json={"password": "test-admin-password"}).status_code
        == 200
    )
    limited = test_client.post(
        "/api/auth/keys",
        json={"name": "Homey", "scope": "read", "permissions": ["screens.power"]},
    ).json()["secret"]
    plain = test_client.post("/api/auth/keys", json={"name": "Script", "scope": "read"}).json()[
        "secret"
    ]
    test_client.cookies.clear()

    assert (
        test_client.get(POWER_URL, headers={"Authorization": f"Bearer {limited}"}).status_code
        == 200
    )
    plain_response = test_client.get(POWER_URL, headers={"Authorization": f"Bearer {plain}"})
    assert plain_response.status_code == 403
    assert plain_response.json()["detail"]["code"] == "insufficient_scope"

    secret = _pair()
    assert (
        test_client.get(POWER_URL, headers={"Authorization": f"Bearer {secret}"}).status_code == 200
    )
    admin = test_client.get(POWER_URL, headers={"cookie": f"{COOKIE_NAME}={admin_cookie}"})
    assert admin.status_code == 200


@pytest.mark.integration
def test_a_paired_screen_whose_agent_polls_without_its_secret_follows_its_schedule(
    test_client: TestClient, monkeypatch
):
    """m3: desiredOn is what the agent will actually receive (design §7)."""
    _set_mode("optional")
    _register_unpaired()
    secret = _pair()
    _hold()  # held off
    _run(config_service.set_value("displayScheduleEnabled", True))
    _run(
        config_service.set_value(
            "displaySchedule",
            [{"day": d, "enabled": True, "onTime": "00:00", "offTime": "23:59"} for d in range(7)],
            value_type="json",
        )
    )

    # An old agent: it polls without the screen's secret, so the hold never
    # reaches it and it follows its schedule.
    assert test_client.get(f"{CONFIG_URL}?khost=pi&kagent=v1&kstat=ok").status_code == 200
    body = test_client.get(POWER_URL).json()
    assert body["paired"] is True and body["held"] is True
    assert body["desiredOn"] is True

    # Once the agent proves it is the screen, the hold reaches it.
    assert (
        test_client.get(
            f"{CONFIG_URL}?khost=pi&kagent=v2&kstat=ok", headers=_auth_bearer(secret)
        ).status_code
        == 200
    )
    assert test_client.get(POWER_URL).json()["desiredOn"] is False

    # A forged agent poll from another address cannot claim it stopped holding.
    monkeypatch.setattr("app.api.routes.kiosks.direct_peer_ip", lambda request: "203.0.113.9")
    assert test_client.get(f"{CONFIG_URL}?kagent=v2&kstat=ok").status_code == 200
    assert test_client.get(POWER_URL).json()["desiredOn"] is False

    # A rolled-back agent from the screen's own address does: its poll carries no
    # secret, so the hold no longer reaches it.
    monkeypatch.setattr("app.api.routes.kiosks.direct_peer_ip", lambda request: "testclient")
    assert test_client.get(f"{CONFIG_URL}?kagent=v2&kstat=ok").status_code == 200
    assert test_client.get(POWER_URL).json()["desiredOn"] is True


def _auth_bearer(secret: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {secret}"}


@pytest.mark.integration
def test_gated_unpaired_screen_follows_its_schedule_and_says_unpaired(test_client: TestClient):
    _set_mode("required")
    _register_unpaired()
    _hold()  # held off, but a gated unpaired screen never receives the hold
    _run(config_service.set_value("displayScheduleEnabled", True))
    _run(
        config_service.set_value(
            "displaySchedule",
            [{"day": d, "enabled": True, "onTime": "00:00", "offTime": "23:59"} for d in range(7)],
            value_type="json",
        )
    )
    body = test_client.get(POWER_URL).json()
    assert body["paired"] is False
    assert body["held"] is True  # the admin still sees the stored hold
    assert body["desiredOn"] is True  # but the screen follows its schedule


@pytest.mark.integration
def test_screen_power_of_an_optional_paired_screen_refuses_a_plain_read_key(test_client):
    _set_mode("optional")
    _register_unpaired()
    _pair()  # optional + paired is gated too
    assert (
        test_client.post("/api/auth/login", json={"password": "test-admin-password"}).status_code
        == 200
    )
    limited = test_client.post(
        "/api/auth/keys",
        json={"name": "Homey", "scope": "read", "permissions": ["screens.power"]},
    ).json()["secret"]
    plain = test_client.post("/api/auth/keys", json={"name": "Script", "scope": "read"}).json()[
        "secret"
    ]
    test_client.cookies.clear()

    assert (
        test_client.get(POWER_URL, headers={"Authorization": f"Bearer {limited}"}).status_code
        == 200
    )
    plain_response = test_client.get(POWER_URL, headers={"Authorization": f"Bearer {plain}"})
    assert plain_response.status_code == 403
    assert plain_response.json()["detail"]["code"] == "insufficient_scope"


@pytest.mark.integration
def test_config_etag_and_cache_headers_differ_by_caller(test_client: TestClient):
    _set_mode("required")
    secret = _pair()
    _hold()
    test_client.cookies.clear()
    anonymous = test_client.get(CONFIG_URL)
    own = test_client.get(CONFIG_URL, headers={"Authorization": f"Bearer {secret}"})
    assert anonymous.headers["cache-control"] == "private, no-cache"
    assert "Cookie" in anonymous.headers["vary"] and "Authorization" in anonymous.headers["vary"]
    assert anonymous.headers["ETag"] != own.headers["ETag"]


@pytest.mark.integration
def test_a_stale_cookie_is_resigned_on_the_config_read(test_client: TestClient):
    kiosk_hash = hash_secret(new_secret())
    _run(kiosk_registry.set_credential(KIOSK, kiosk_hash))
    stale = issue_kiosk_cookie(KIOSK, kiosk_hash, now=time.time() - 40 * 24 * 3600)
    test_client.cookies.clear()
    response = test_client.get(CONFIG_URL, headers={"cookie": f"{KIOSK_COOKIE}={stale}"})
    assert response.status_code == 200
    assert response.json()["kioskAuth"]["state"] == "paired"
    assert "set-cookie" in response.headers
    assert KIOSK_COOKIE in response.headers["set-cookie"]


@pytest.mark.integration
def test_an_expired_cookie_is_no_credential_on_the_config_read(test_client: TestClient):
    kiosk_hash = hash_secret(new_secret())
    _run(kiosk_registry.set_credential(KIOSK, kiosk_hash))
    expired = issue_kiosk_cookie(KIOSK, kiosk_hash, now=time.time() - 401 * 24 * 3600)
    test_client.cookies.clear()
    response = test_client.get(CONFIG_URL, headers={"cookie": f"{KIOSK_COOKIE}={expired}"})
    assert response.status_code == 200, response.text
    assert response.json()["kioskAuth"]["state"] == "unpaired"


@pytest.mark.integration
@pytest.mark.parametrize(
    "headers",
    [
        {"cookie": f"{KIOSK_COOKIE}=k1.garbage"},
        {"cookie": f'{KIOSK_COOKIE}="k1.68616c6c.0123456789abcdef.1.\\351"'},
        {"Authorization": f"Bearer clv_kiosk_{'a' * 43}"},
    ],
)
def test_a_bad_or_stale_credential_is_no_credential_on_the_config_read(test_client, headers):
    _register_unpaired()
    response = test_client.get(CONFIG_URL, headers=headers)
    assert response.status_code == 200, response.text
    assert response.json()["kioskAuth"]["state"] == "unpaired"


@pytest.mark.integration
def test_another_screens_or_a_revoked_credential_is_no_credential_on_the_config_read(
    test_client,
):
    _register_unpaired()
    revoked = _pair()
    active = _pair()  # re-pairing revokes the first secret
    other = _pair("hall")
    test_client.cookies.clear()

    for secret in (other, revoked):
        response = test_client.get(CONFIG_URL, headers={"Authorization": f"Bearer {secret}"})
        assert response.status_code == 200, response.text
        assert response.json()["kioskAuth"]["state"] == "unpaired"

    own = test_client.get(CONFIG_URL, headers={"Authorization": f"Bearer {active}"})
    assert own.json()["kioskAuth"]["state"] == "paired"


@pytest.mark.integration
def test_a_foreign_or_stale_cookie_is_not_resigned_on_another_screens_config_read(test_client):
    _register_unpaired()
    hall_hash = hash_secret(new_secret())
    _run(kiosk_registry.set_credential("hall", hall_hash))
    stale = issue_kiosk_cookie("hall", hall_hash, now=time.time() - 40 * 24 * 3600)
    test_client.cookies.clear()

    other = test_client.get(CONFIG_URL, headers={"cookie": f"{KIOSK_COOKIE}={stale}"})
    assert other.status_code == 200, other.text
    assert other.json()["kioskAuth"]["state"] == "unpaired"
    assert "set-cookie" not in other.headers

    own = test_client.get("/api/kiosks/hall/config", headers={"cookie": f"{KIOSK_COOKIE}={stale}"})
    assert own.status_code == 200, own.text
    assert own.json()["kioskAuth"]["state"] == "paired"
    assert KIOSK_COOKIE in own.headers["set-cookie"]


@pytest.mark.integration
def test_overrides_layer_cannot_change_the_household_mode(test_client: TestClient):
    _set_mode("optional")
    _pair()
    response = test_client.put(OVERRIDES_URL, json={"overrides": {"kioskPairing": "required"}})
    assert response.status_code == 200
    from app.services.kiosk_view import pairing_mode

    assert _run(pairing_mode()) == "optional"
    test_client.cookies.clear()
    assert test_client.get(POWER_URL).status_code == 401  # paired: gated from its presence
