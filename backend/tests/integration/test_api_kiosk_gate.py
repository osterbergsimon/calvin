"""Only a paired screen reports for itself on a gated screen (calvin-0xns, Task 6)."""

import asyncio

import pytest
from fastapi.testclient import TestClient

from app.security.admin_auth import COOKIE_NAME
from app.security.kiosk_auth import KIOSK_COOKIE, issue_kiosk_cookie
from app.services import display_check, kiosk_registry
from app.services.config_service import config_service
from app.services.kiosk_pairing import hash_secret, new_secret, pairing_store

KIOSK = "kitchen"
CONFIG_URL = f"/api/kiosks/{KIOSK}/config"
SLEEP_URL = f"/api/kiosks/{KIOSK}/screen-sleep"
REPORT_URL = f"/api/kiosks/{KIOSK}/display-check"


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    pairing_store._pending.clear()
    pairing_store._install_codes.clear()
    pairing_store._new_by_address.clear()
    _clear_view_state()

    async def no_op():
        return None

    for module in ("app.services.kiosk_registry", "app.api.routes.kiosks"):
        monkeypatch.setattr(f"{module}._adopt_global_settings", no_op, raising=False)
    yield
    pairing_store._pending.clear()
    pairing_store._install_codes.clear()
    pairing_store._new_by_address.clear()
    _clear_view_state()


def _clear_view_state() -> None:
    """The registry's in-memory presence evidence must not leak between tests."""
    kiosk_registry.browser_seen.clear()
    getattr(kiosk_registry, "auth_peer_ips", {}).clear()
    getattr(kiosk_registry, "agent_polls", {}).clear()


def _set_mode(mode: str) -> None:
    if mode == "required":
        _run(config_service.set_value("kioskPairing", "required"))
    else:
        _run(config_service.delete_value("kioskPairing"))


def _register(kiosk_id: str = KIOSK, *, peer: str | None = "10.0.0.2") -> None:
    _run(
        kiosk_registry.record_kiosk(
            kiosk_id,
            hostname="pi-kitchen",
            agent_version="v1",
            agent_features="hold",
            peer_ip=peer,
        )
    )


def _pair(kiosk_id: str = KIOSK) -> str:
    secret = new_secret()
    _run(kiosk_registry.set_credential(kiosk_id, hash_secret(secret)))
    return secret


def _auth(secret: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {secret}"}


def _key(client: TestClient, scope: str = "read", permissions: list[str] | None = None) -> str:
    body: dict = {"name": f"{scope}-key", "scope": scope}
    if permissions is not None:
        body["permissions"] = permissions
    response = client.post("/api/auth/keys", json=body)
    assert response.status_code == 201, response.text
    return response.json()["secret"]


def _row(kiosk_id: str = KIOSK) -> dict:
    return next(k for k in _run(kiosk_registry.list_kiosks()) if k["id"] == kiosk_id)


def _admin_cookie(client: TestClient) -> str:
    value = client.cookies.get(COOKIE_NAME)
    assert value
    return value


@pytest.mark.integration
@pytest.mark.parametrize("mode", ["optional", "required"])
def test_forged_poll_on_gated_screen_writes_nothing(
    test_client: TestClient, monkeypatch, mode: str
):
    _set_mode(mode)
    _register()
    _pair()
    before = _row()

    monkeypatch.setattr("app.api.routes.kiosks.direct_peer_ip", lambda request: "203.0.113.9")
    test_client.cookies.clear()
    forged = test_client.get(
        f"{CONFIG_URL}?khost=x&kagent=y&kstat=error&kmsg=forged&kfeat=&vw=1&vh=1"
    )
    assert forged.status_code == 200, forged.text
    assert _row() == before


@pytest.mark.integration
def test_required_mode_forged_poll_creates_no_row(test_client: TestClient, monkeypatch):
    _set_mode("required")
    test_client.cookies.clear()
    monkeypatch.setattr("app.api.routes.kiosks.direct_peer_ip", lambda request: "203.0.113.9")
    response = test_client.get("/api/kiosks/ghost/config?khost=x&kagent=y&kstat=error")
    assert response.status_code == 200
    assert _run(kiosk_registry.list_kiosks()) == []


@pytest.mark.integration
def test_paired_screen_old_agent_poll_is_read_only(test_client: TestClient):
    """Review Focus line 1: an old agent that polls without a bearer keeps its dashboard."""
    _register()  # the row exists with last_seen and the old agent's reports
    _pair()
    before = _row()

    test_client.cookies.clear()
    response = test_client.get(f"{CONFIG_URL}?khost=pi&kagent=v2&kstat=ok&kfeat=hold")
    assert response.status_code == 200
    assert "orientation" in response.json()
    assert _row() == before


@pytest.mark.integration
def test_the_screen_own_poll_writes_as_today(test_client: TestClient):
    _register()
    secret = _pair()
    response = test_client.get(
        f"{CONFIG_URL}?khost=pi&kagent=v3&kstat=ok&kfeat=hold&vw=1080&vh=1920",
        headers=_auth(secret),
    )
    assert response.status_code == 200
    row = _row()
    assert row["agentVersion"] == "v3"
    assert row["agentHolds"] is True
    assert row["viewport"] == {"w": 1080, "h": 1920}


@pytest.mark.integration
def test_screen_sleep_on_a_gated_screen_needs_the_screen_itself(
    test_client: TestClient, monkeypatch
):
    _register()
    _pair()
    other = _pair("hall")
    admin_cookie = _admin_cookie(test_client)
    calls: list[str | None] = []
    from app.api.routes import kiosks as kiosks_routes

    original = kiosks_routes.lock_kiosk_sessions
    monkeypatch.setattr(
        kiosks_routes, "lock_kiosk_sessions", lambda kiosk_id: calls.append(kiosk_id)
    )

    test_client.cookies.clear()
    anonymous = test_client.post(SLEEP_URL)
    assert anonymous.status_code == 401
    assert anonymous.json()["detail"]["code"] == "kiosk_unpaired"

    theirs = test_client.post(SLEEP_URL, headers=_auth(other))
    assert theirs.status_code == 401
    assert theirs.json()["detail"]["code"] == "kiosk_unpaired"

    admin = test_client.post(SLEEP_URL, headers={"cookie": f"{COOKIE_NAME}={admin_cookie}"})
    assert admin.status_code == 401
    assert admin.json()["detail"]["code"] == "kiosk_unpaired"
    assert calls == []

    own_secret = new_secret()
    # Pair the screen with a secret we hold here, then report as it.
    _run(kiosk_registry.set_credential(KIOSK, hash_secret(own_secret)))
    own = test_client.post(SLEEP_URL, headers=_auth(own_secret))
    assert own.status_code == 200
    assert calls == [KIOSK]
    monkeypatch.setattr(kiosks_routes, "lock_kiosk_sessions", original)


@pytest.mark.integration
def test_screen_sleep_on_an_ungated_screen_keeps_the_peer_check(test_client: TestClient):
    _register(peer="10.0.0.2")
    test_client.cookies.clear()
    response = test_client.post(SLEEP_URL)
    assert response.status_code == 403  # the test client is not that address
    assert "kiosk_unpaired" not in response.text


@pytest.mark.integration
def test_display_check_report_on_a_gated_screen_needs_the_screen_itself(test_client: TestClient):
    _register()
    revoked = _pair()
    secret = _pair()  # re-pairing revokes the first secret
    pending_secret = new_secret()
    pairing_store.start(KIOSK, hash_secret(pending_secret), "10.0.0.2")
    other = _pair("hall")
    admin_cookie = _admin_cookie(test_client)
    admin_key = _key(test_client, "admin")
    run = _run(display_check.start_run(KIOSK, display_check.StartRequest(step="detect")))
    body = {"id": run["id"], "status": "running"}

    test_client.cookies.clear()
    anonymous = test_client.post(REPORT_URL, json=body)
    assert anonymous.status_code == 401
    assert anonymous.json()["detail"]["code"] == "kiosk_unpaired"

    for secret_value in (revoked, pending_secret, other, admin_key):
        refused = test_client.post(REPORT_URL, json=body, headers=_auth(secret_value))
        assert refused.status_code == 401
        assert refused.json()["detail"]["code"] == "kiosk_unpaired"

    admin = test_client.post(
        REPORT_URL, json=body, headers={"cookie": f"{COOKIE_NAME}={admin_cookie}"}
    )
    assert admin.status_code == 401
    assert admin.json()["detail"]["code"] == "kiosk_unpaired"

    accepted = test_client.post(REPORT_URL, json=body, headers=_auth(secret))
    assert accepted.status_code == 200, accepted.text

    wrong = test_client.post(
        REPORT_URL, json={"id": "not-the-run", "status": "running"}, headers=_auth(secret)
    )
    assert wrong.status_code == 409


@pytest.mark.integration
def test_screen_sleep_refuses_revoked_pending_and_admin_key_credentials(test_client: TestClient):
    _register()
    revoked = _pair()
    active = _pair()  # the first secret is revoked by the re-pairing
    pending_secret = new_secret()
    pairing_store.start(KIOSK, hash_secret(pending_secret), "10.0.0.2")
    admin_key = _key(test_client, "admin")
    test_client.cookies.clear()

    for secret in (revoked, pending_secret):
        response = test_client.post(SLEEP_URL, headers=_auth(secret))
        assert response.status_code == 401
        assert response.json()["detail"]["code"] == "kiosk_unpaired"

    keyed = test_client.post(SLEEP_URL, headers=_auth(admin_key))
    assert keyed.status_code == 401
    assert keyed.json()["detail"]["code"] == "kiosk_unpaired"

    own = test_client.post(SLEEP_URL, headers=_auth(active))
    assert own.status_code == 200


@pytest.mark.integration
def test_required_unpaired_screen_refuses_a_recorded_peer_on_both_routes(test_client: TestClient):
    from app.models.db_models import KioskDB

    _set_mode("required")
    _register(peer="testclient")
    test_client.cookies.clear()
    # The address is in the row (this service call records it directly), yet the
    # gate refuses both routes: required + unpaired accepts nobody (design §7).
    assert "testclient" in (_run(KioskDB.objects.get(id=KIOSK)).peer_ips or {})

    sleep = test_client.post(SLEEP_URL)
    assert sleep.status_code == 401
    assert sleep.json()["detail"]["code"] == "kiosk_unpaired"

    report = test_client.post(REPORT_URL, json={"id": "any", "status": "running"})
    assert report.status_code == 401
    assert report.json()["detail"]["code"] == "kiosk_unpaired"


@pytest.mark.integration
def test_browser_seen_reads_unpaired_for_a_cookie_less_browser_poll(test_client: TestClient):
    _register(peer="testclient")  # records the peer address
    secret = _pair()
    test_client.cookies.clear()
    # The agent's authenticated poll keeps the screen's address known (a pairing
    # forgets everything recorded before it, calvin-0xns).
    assert (
        test_client.get(f"{CONFIG_URL}?khost=pi&kagent=v1", headers=_auth(secret)).status_code
        == 200
    )
    assert test_client.get(f"{CONFIG_URL}?khost=pi").status_code == 200

    auth = test_client.get(CONFIG_URL, headers=_auth(secret)).json()["kioskAuth"]
    assert auth["browser"] == "unpaired"


@pytest.mark.integration
def test_browser_seen_reads_paired_when_the_browser_has_its_cookie(test_client: TestClient):
    _register(peer="testclient")
    secret = _pair()
    cookie = issue_kiosk_cookie(KIOSK, _run(kiosk_registry.get_credential_hash(KIOSK)))
    test_client.cookies.clear()
    assert (
        test_client.get(
            f"{CONFIG_URL}?khost=pi", headers={"cookie": f"{KIOSK_COOKIE}={cookie}"}
        ).status_code
        == 200
    )

    auth = test_client.get(CONFIG_URL, headers=_auth(secret)).json()["kioskAuth"]
    assert auth["browser"] == "paired"


@pytest.mark.integration
def test_browser_seen_stays_unknown_from_a_foreign_address(test_client: TestClient, monkeypatch):
    _register()
    secret = _pair()
    monkeypatch.setattr("app.api.routes.kiosks.direct_peer_ip", lambda request: "203.0.113.9")
    test_client.cookies.clear()
    assert test_client.get(f"{CONFIG_URL}?khost=pi").status_code == 200

    auth = test_client.get(CONFIG_URL, headers=_auth(secret)).json()["kioskAuth"]
    assert auth["browser"] == "unknown"


@pytest.mark.integration
def test_kiosk_for_peer_ignores_a_forged_poll_address(test_client: TestClient, monkeypatch):
    _set_mode("required")
    test_client.cookies.clear()
    monkeypatch.setattr("app.api.routes.kiosks.direct_peer_ip", lambda request: "203.0.113.9")
    test_client.get("/api/kiosks/ghost/config?khost=x&kagent=y")
    assert _run(kiosk_registry.kiosk_for_peer("203.0.113.9")) is None


@pytest.mark.integration
def test_a_pre_pairing_forged_poll_stops_counting_after_pairing(
    test_client: TestClient, monkeypatch
):
    """m1: peer addresses recorded before pairing no longer name the screen."""
    _register(peer=None)
    monkeypatch.setattr("app.api.routes.kiosks.direct_peer_ip", lambda request: "203.0.113.9")
    test_client.cookies.clear()
    # While optional and unpaired, an anonymous poll may write its address.
    assert test_client.get(f"{CONFIG_URL}?khost=forged").status_code == 200
    assert _run(kiosk_registry.kiosk_for_peer("203.0.113.9")) == KIOSK

    secret = _pair()
    assert _run(kiosk_registry.kiosk_for_peer("203.0.113.9")) is None

    # A cookie-less browser poll from that address must not count either: it
    # cannot make the agent restart the browser.
    assert test_client.get(f"{CONFIG_URL}?khost=forged").status_code == 200
    auth = test_client.get(CONFIG_URL, headers=_auth(secret)).json()["kioskAuth"]
    assert auth["browser"] == "unknown"

    # And it cannot sign the screen out.
    sleep = test_client.post(SLEEP_URL)
    assert sleep.status_code == 401
    assert sleep.json()["detail"]["code"] == "kiosk_unpaired"
