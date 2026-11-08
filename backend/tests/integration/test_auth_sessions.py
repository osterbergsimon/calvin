"""Session kinds and lifetimes: kiosk minutes, device a month (calvin-q4o8)."""

import time

import pytest
from fastapi.testclient import TestClient

from app.security.admin_auth import SessionKind, get_admin_store, login_limiter

pytestmark = pytest.mark.no_admin_login

PASSWORD = "test-admin-password"
COOKIE = "calvin_admin"


@pytest.fixture(autouse=True)
def _clean():
    login_limiter._failures.clear()
    login_limiter._lockouts.clear()
    yield
    login_limiter._failures.clear()
    login_limiter._lockouts.clear()


def _login(client: TestClient, **extra):
    return client.post("/api/auth/login", json={"password": PASSWORD, **extra})


def _cookie_value(response) -> str:
    header = response.headers["set-cookie"]
    return header.split(";", 1)[0].split("=", 1)[1]


def _hold(client: TestClient, kind: SessionKind, kiosk_id: str | None, age: int) -> None:
    """Give the client a session whose last use was `age` seconds ago."""
    client.cookies.clear()
    value = get_admin_store().issue_cookie(kind, kiosk_id, now=int(time.time()) - age)
    client.cookies.set(COOKIE, value)


def _authenticated(client: TestClient) -> bool:
    return client.get("/api/auth/status").json()["authenticated"]


def test_a_device_login_lasts_about_30_days(test_client: TestClient):
    response = _login(test_client)
    assert response.status_code == 200
    assert "Max-Age=2592000" in response.headers["set-cookie"]
    assert _cookie_value(response).startswith("v2.d.")


def test_a_login_that_names_a_kiosk_gets_a_5_minute_session(test_client: TestClient):
    response = _login(test_client, kiosk="hall-1")
    assert "Max-Age=300" in response.headers["set-cookie"]
    assert _cookie_value(response).startswith("v2.k.")


def test_a_login_from_a_registered_kiosk_address_is_a_kiosk_session_even_if_it_claims_nothing(
    test_client: TestClient,
):
    """The kiosk's own address is something a visitor at the kiosk cannot change."""
    assert test_client.get("/api/kiosks/hall-1/config?khost=pi").status_code == 200
    response = _login(test_client)  # no `kiosk` in the body: the claim was dropped
    assert "Max-Age=300" in response.headers["set-cookie"]
    assert _cookie_value(response).startswith("v2.k.")


def test_an_unregistered_address_cannot_be_made_a_kiosk_by_a_claim_alone_widening_nothing(
    test_client: TestClient,
):
    # A claim can only shorten a session, so lying about it only hurts the liar.
    assert "Max-Age=2592000" in _login(test_client, kiosk="").headers["set-cookie"]


def test_touch_keeps_a_kiosk_session_alive(test_client: TestClient):
    _hold(test_client, SessionKind.KIOSK, "hall-1", age=250)
    touched = test_client.post("/api/auth/touch")
    assert touched.status_code == 200
    assert touched.json() == {"authenticated": True}
    assert "Max-Age=300" in touched.headers["set-cookie"]
    assert _authenticated(test_client) is True


def test_an_idle_kiosk_session_is_gone_and_touch_cannot_revive_it(test_client: TestClient):
    _hold(test_client, SessionKind.KIOSK, "hall-1", age=301)
    assert _authenticated(test_client) is False
    touched = test_client.post("/api/auth/touch")
    assert touched.json() == {"authenticated": False}
    assert COOKIE in touched.headers["set-cookie"] and "Max-Age=0" in touched.headers["set-cookie"]


def test_the_status_check_does_not_keep_a_kiosk_session_alive(test_client: TestClient):
    """The page polls status; a sleeping screen must still lapse."""
    _hold(test_client, SessionKind.KIOSK, "hall-1", age=100)
    response = test_client.get("/api/auth/status")
    assert response.json()["authenticated"] is True
    assert "set-cookie" not in response.headers


def test_admin_routes_refuse_an_idle_kiosk_session(test_client: TestClient):
    _hold(test_client, SessionKind.KIOSK, "hall-1", age=400)
    response = test_client.post("/api/calendar/sources", json={})
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "admin_required"


def test_using_admin_routes_renews_a_device_session(test_client: TestClient):
    _hold(test_client, SessionKind.DEVICE, None, age=2 * 24 * 3600)
    response = test_client.get("/api/share/links")
    assert response.status_code == 200
    assert "Max-Age=2592000" in response.headers["set-cookie"]


def test_a_device_session_idle_for_over_30_days_is_gone(test_client: TestClient):
    _hold(test_client, SessionKind.DEVICE, None, age=31 * 24 * 3600)
    assert _authenticated(test_client) is False


def test_a_cookie_from_before_this_change_signs_out_once_without_a_loop(test_client: TestClient):
    """The old 400-day cookie is refused, cleared, and a normal login replaces it."""
    import hashlib
    import hmac

    store = get_admin_store()
    data = store._load()
    issued = int(time.time())
    mac = hmac.new(
        bytes.fromhex(data["server_secret"]),
        f"{issued}.{data['generation']}".encode(),
        hashlib.sha256,
    ).hexdigest()
    test_client.cookies.set(COOKIE, f"{issued}.{data['generation']}.{mac}")

    status = test_client.get("/api/auth/status")
    assert status.json() == {"configured": True, "authenticated": False}
    assert "Max-Age=0" in status.headers["set-cookie"]  # cleared, so it is not sent again

    assert _login(test_client).status_code == 200
    assert _authenticated(test_client) is True


def test_a_screen_going_to_sleep_ends_that_kiosks_sessions(test_client: TestClient):
    assert test_client.get("/api/kiosks/hall-1/config?khost=pi").status_code == 200
    now = int(time.time())
    store = get_admin_store()
    kiosk = store.issue_cookie(SessionKind.KIOSK, "hall-1", now=now - 5)
    other = store.issue_cookie(SessionKind.KIOSK, "den", now=now - 5)
    phone = store.issue_cookie(now=now - 5)

    assert test_client.post("/api/kiosks/hall-1/screen-sleep").status_code == 200

    for value, expected in ((kiosk, False), (other, True), (phone, True)):
        test_client.cookies.clear()
        test_client.cookies.set(COOKIE, value)
        assert _authenticated(test_client) is expected
    # The kiosk can sign in again once it wakes.
    time.sleep(1.1)
    assert _login(test_client, kiosk="hall-1").status_code == 200
    assert _authenticated(test_client) is True


def test_screen_sleep_for_an_unknown_kiosk_is_404_and_locks_nothing(test_client: TestClient):
    assert test_client.post("/api/kiosks/never-seen/screen-sleep").status_code == 404


def test_changing_the_password_keeps_the_session_kind(test_client: TestClient):
    _login(test_client, kiosk="hall-1")
    response = test_client.post(
        "/api/auth/password", json={"current": PASSWORD, "new": "another-password-1"}
    )
    assert response.status_code == 200
    assert _cookie_value(response).startswith("v2.k.")
    assert "Max-Age=300" in response.headers["set-cookie"]
    get_admin_store().set_password(PASSWORD)  # restore for the other tests


def test_first_run_setup_with_a_kiosk_claim_is_a_kiosk_session(test_client: TestClient):
    from app.security.setup_code import ensure_setup_code, format_code, invalidate_setup_code

    get_admin_store().reset()
    code = ensure_setup_code()
    response = test_client.post(
        "/api/auth/setup",
        json={"password": "first-run-pass-1", "code": format_code(code), "kiosk": "hall-1"},
    )
    assert response.status_code == 200
    assert _cookie_value(response).startswith("v2.k.")
    invalidate_setup_code()
    get_admin_store().set_password(PASSWORD)


def test_a_loopback_caller_gets_no_admin_session_for_free(test_client: TestClient):
    """The loopback-trusted path only ever shows the first-run setup code.

    A visitor at an all-in-one kiosk (the page reaches Calvin over loopback) must
    not gain admin from that: once a password exists the code is gone, and no
    admin route opens without a session (calvin-q4o8).
    """
    local = TestClient(test_client.app, client=("127.0.0.1", 50000))
    code = local.get("/api/auth/setup-code")
    assert code.status_code == 404 and code.json()["detail"]["code"] == "already_configured"
    assert local.get("/api/auth/status").json()["authenticated"] is False
    assert local.get("/api/share/links").status_code == 401
    assert local.post("/api/calendar/sources", json={}).status_code == 401
