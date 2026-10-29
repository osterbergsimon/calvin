"""Admin auth endpoints: setup, login, logout, password change (CLV-9)."""

import pytest
from fastapi.testclient import TestClient

from app.security.admin_auth import get_admin_store, login_limiter

pytestmark = pytest.mark.no_admin_login


@pytest.fixture(autouse=True)
def _clean_rate_limiter():
    login_limiter._failures.clear()
    login_limiter._lockouts.clear()
    yield
    login_limiter._failures.clear()
    login_limiter._lockouts.clear()


def _code(response) -> str | None:
    detail = response.json().get("detail")
    return detail.get("code") if isinstance(detail, dict) else None


def _login(client: TestClient, password: str = "test-admin-password"):
    return client.post("/api/auth/login", json={"password": password})


def test_status_unconfigured(test_client):
    get_admin_store().reset()
    response = test_client.get("/api/auth/status")
    assert response.status_code == 200
    assert response.json() == {"configured": False, "authenticated": False}


def test_setup_logs_in(test_client):
    get_admin_store().reset()
    response = test_client.post("/api/auth/setup", json={"password": "setup-pass-1"})
    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert "calvin_admin" in response.headers["set-cookie"]

    status = test_client.get("/api/auth/status").json()
    assert status == {"configured": True, "authenticated": True}
    assert test_client.post("/api/calendar/sources", json={}).status_code != 401


def test_second_setup_409(test_client):
    get_admin_store().reset()
    assert test_client.post("/api/auth/setup", json={"password": "setup-pass-1"}).status_code == 200
    second = test_client.post("/api/auth/setup", json={"password": "setup-pass-2"})
    assert second.status_code == 409
    assert _code(second) == "already_configured"


def test_setup_short_password_422(test_client):
    get_admin_store().reset()
    response = test_client.post("/api/auth/setup", json={"password": "short"})
    assert response.status_code == 422
    assert _code(response) == "password_too_short"


def test_login_wrong_then_right(test_client):
    wrong = _login(test_client, "not-the-password")
    assert wrong.status_code == 401
    assert _code(wrong) == "bad_password"
    right = _login(test_client)
    assert right.status_code == 200
    assert test_client.get("/api/auth/status").json()["authenticated"] is True


def test_login_unconfigured_says_setup_required(test_client):
    get_admin_store().reset()
    response = _login(test_client, "whatever-pass")
    assert response.status_code == 401
    assert _code(response) == "setup_required"


def test_login_rate_limited(test_client):
    for _ in range(5):
        assert _login(test_client, "wrong-password").status_code == 401
    limited = _login(test_client)
    assert limited.status_code == 429
    assert _code(limited) == "rate_limited"
    assert int(limited.headers["Retry-After"]) > 0
    assert limited.json()["detail"]["retry_after"] > 0


def test_password_change_rate_limited(test_client):
    assert _login(test_client).status_code == 200
    for _ in range(5):
        response = test_client.post(
            "/api/auth/password",
            json={"current": "wrong-password", "new": "another-pass-1"},
        )
        assert response.status_code == 401
        assert _code(response) == "bad_password"

    limited = test_client.post(
        "/api/auth/password",
        json={"current": "test-admin-password", "new": "another-pass-1"},
    )
    assert limited.status_code == 429
    assert int(limited.headers["Retry-After"]) > 0

    # Same peer IP, even a fresh store: still locked out.
    get_admin_store().reset()
    setup = test_client.post("/api/auth/setup", json={"password": "setup-pass-1"})
    assert setup.status_code == 429
    assert int(setup.headers["Retry-After"]) > 0


def test_logout_clears(test_client):
    assert _login(test_client).status_code == 200
    assert test_client.post("/api/auth/logout").status_code == 200
    assert test_client.post("/api/calendar/sources", json={}).status_code == 401


def test_password_change_signs_out_others(test_client):
    other = TestClient(test_client.app)
    try:
        assert _login(test_client).status_code == 200
        assert _login(other).status_code == 200
        assert other.post("/api/calendar/sources", json={}).status_code != 401

        changed = test_client.post(
            "/api/auth/password",
            json={"current": "test-admin-password", "new": "brand-new-pass"},
        )
        assert changed.status_code == 200

        assert test_client.post("/api/calendar/sources", json={}).status_code != 401
        mirrored = other.post("/api/calendar/sources", json={})
        assert mirrored.status_code == 401
        assert _code(mirrored) == "admin_required"
    finally:
        other.close()


def test_env_password_presets(test_client, monkeypatch):
    from app.config import settings
    from app.security.install import apply_startup_admin_password

    get_admin_store().reset()
    monkeypatch.setattr(settings, "admin_password", "preset-pass-1")
    apply_startup_admin_password()

    assert test_client.get("/api/auth/status").json()["configured"] is True
    assert _login(test_client, "preset-pass-1").status_code == 200


def test_cookie_attributes(test_client):
    response = _login(test_client)
    header = response.headers["set-cookie"].lower()
    assert "httponly" in header
    assert "samesite=strict" in header
    assert "path=/" in header
    assert "max-age=34560000" in header
