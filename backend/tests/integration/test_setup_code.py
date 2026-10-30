"""One-time setup code gating the first admin password (CLV-61)."""

import stat

import pytest
from fastapi.testclient import TestClient

from app.security import setup_code as setup_code_module
from app.security.admin_auth import get_admin_store, login_limiter
from app.security.setup_code import (
    ensure_setup_code,
    format_code,
    invalidate_setup_code,
    setup_code_path,
)

pytestmark = pytest.mark.no_admin_login


@pytest.fixture(autouse=True)
def _fresh_state(monkeypatch):
    login_limiter._failures.clear()
    login_limiter._lockouts.clear()
    get_admin_store().reset()
    invalidate_setup_code()
    monkeypatch.setattr("app.config.settings.setup_code", "")
    yield
    get_admin_store().reset()
    invalidate_setup_code()
    login_limiter._failures.clear()
    login_limiter._lockouts.clear()


def _code(response) -> str | None:
    detail = response.json().get("detail")
    return detail.get("code") if isinstance(detail, dict) else None


def _setup(client: TestClient, password: str, code: str | None = None):
    if code is None:
        current = ensure_setup_code()
        code = format_code(current) if current else "AAAA-BBBB"
    return client.post("/api/auth/setup", json={"password": password, "code": code})


def test_setup_without_code_422(test_client):
    get_admin_store().reset()
    response = test_client.post("/api/auth/setup", json={"password": "setup-pass-1"})
    assert response.status_code == 422
    assert not get_admin_store().is_configured()


def test_setup_wrong_code_403_and_rate_limited(test_client):
    get_admin_store().reset()
    ensure_setup_code()

    for _ in range(5):
        response = _setup(test_client, "setup-pass-1", code="AAAA-BBBB")
        assert response.status_code == 403
        assert _code(response) == "bad_setup_code"

    limited = _setup(test_client, "setup-pass-1")
    assert limited.status_code == 429
    assert _code(limited) == "rate_limited"
    assert int(limited.headers["Retry-After"]) > 0
    assert not get_admin_store().is_configured()


def test_right_code_sets_password_and_invalidates_code(test_client):
    get_admin_store().reset()
    code = format_code(ensure_setup_code())
    path = setup_code_path()
    assert path.exists()

    response = _setup(test_client, "setup-pass-1", code=code)
    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert get_admin_store().is_configured()
    assert not path.exists()
    assert ensure_setup_code() is None

    # The same code cannot be replayed: setup is closed and no code remains.
    second = _setup(test_client, "setup-pass-2", code=code)
    assert second.status_code == 409
    assert _code(second) == "already_configured"
    assert test_client.get("/api/auth/status").json()["configured"] is True


def test_code_is_case_and_separator_insensitive(test_client):
    get_admin_store().reset()
    code = ensure_setup_code()
    assert len(code) == 8
    spaced = f" {code[:4].lower()}-{code[4:].lower()} "
    assert _setup(test_client, "setup-pass-1", code=spaced).status_code == 200


def test_env_pre_seed(monkeypatch, test_client):
    get_admin_store().reset()
    monkeypatch.setattr("app.config.settings.setup_code", "wxyz-2345")

    assert ensure_setup_code() == "WXYZ2345"
    assert _setup(test_client, "setup-pass-1", code="WXYZ-2345").status_code == 200


def test_restart_keeps_the_same_code_until_used(monkeypatch, test_client):
    get_admin_store().reset()
    first = ensure_setup_code()
    # A restart clears process memory; the 0600 file is what brings it back.
    monkeypatch.setattr(setup_code_module, "_memory_code", None)

    assert ensure_setup_code() == first
    assert _setup(test_client, "setup-pass-1", code=format_code(first)).status_code == 200


def test_setup_code_file_is_0600(test_client):
    get_admin_store().reset()
    ensure_setup_code()
    mode = stat.S_IMODE(setup_code_path().stat().st_mode)
    assert mode == 0o600


def test_get_setup_code_is_loopback_only(test_client):
    get_admin_store().reset()
    code = format_code(ensure_setup_code())

    public = test_client.get("/api/auth/setup-code")
    assert public.status_code == 403
    assert _code(public) == "loopback_only"
    assert code not in public.text

    with TestClient(test_client.app, client=("127.0.0.1", 50000)) as loopback:
        allowed = loopback.get("/api/auth/setup-code")
        assert allowed.status_code == 200
        assert allowed.json() == {"code": code}

    # Once a password exists there is nothing left to reveal.
    assert _setup(test_client, "setup-pass-1", code=code).status_code == 200
    with TestClient(test_client.app, client=("127.0.0.1", 50000)) as loopback:
        assert loopback.get("/api/auth/setup-code").status_code == 404


def test_get_setup_code_refuses_a_lan_peer(test_client):
    get_admin_store().reset()
    ensure_setup_code()

    with TestClient(test_client.app, client=("192.168.1.50", 50000)) as lan:
        response = lan.get("/api/auth/setup-code")
    assert response.status_code == 403
    assert _code(response) == "loopback_only"


@pytest.mark.parametrize(
    ("header", "value"),
    [
        ("Forwarded", "for=192.168.1.50"),
        ("X-Forwarded-For", "192.168.1.50"),
        ("X-Forwarded-For", "127.0.0.1"),  # a spoofed loopback address
        ("X-Forwarded-Host", "calvin.example.com"),
        ("X-Forwarded-Proto", "https"),
        ("X-Real-IP", "192.168.1.50"),
    ],
)
def test_get_setup_code_refuses_loopback_with_any_proxy_header(test_client, header, value):
    """A same-host reverse proxy makes every peer loopback; never trust it."""
    get_admin_store().reset()
    code = format_code(ensure_setup_code())

    with TestClient(test_client.app, client=("127.0.0.1", 50000)) as loopback:
        response = loopback.get("/api/auth/setup-code", headers={header: value})
    assert response.status_code == 403
    assert _code(response) == "loopback_only"
    assert code not in response.text


def test_get_setup_code_refuses_an_empty_proxy_header(test_client):
    get_admin_store().reset()
    ensure_setup_code()

    with TestClient(test_client.app, client=("127.0.0.1", 50000)) as loopback:
        response = loopback.get("/api/auth/setup-code", headers={"X-Forwarded-For": ""})
    assert response.status_code == 403
    assert _code(response) == "loopback_only"


def test_code_never_returned_by_status_or_config(test_client):
    get_admin_store().reset()
    code = ensure_setup_code()
    formatted = format_code(code)

    for path in ("/api/auth/status", "/api/config"):
        response = test_client.get(path)
        assert response.status_code == 200
        assert code not in response.text
        assert formatted not in response.text


def _capture_warnings():
    from loguru import logger

    messages: list[str] = []
    sink = logger.add(lambda message: messages.append(str(message)), level="WARNING")
    return messages, sink


def test_startup_logs_the_code(monkeypatch, test_client):
    from loguru import logger

    from app.security.install import apply_startup_admin_password

    get_admin_store().reset()
    monkeypatch.setattr("app.config.settings.admin_password", "")
    messages, sink = _capture_warnings()
    try:
        apply_startup_admin_password()
    finally:
        logger.remove(sink)

    code = format_code(ensure_setup_code())
    assert any(f"Calvin setup code: {code}" in message for message in messages)


def test_failed_attempt_logs_the_code(test_client):
    from loguru import logger

    get_admin_store().reset()
    code = format_code(ensure_setup_code())
    messages, sink = _capture_warnings()
    try:
        assert _setup(test_client, "setup-pass-1", code="AAAA-BBBB").status_code == 403
    finally:
        logger.remove(sink)

    assert any(f"Calvin setup code: {code}" in message for message in messages)


def test_env_admin_password_bypasses_setup(monkeypatch, test_client):
    from app.security.install import apply_startup_admin_password

    get_admin_store().reset()
    monkeypatch.setattr("app.config.settings.admin_password", "preset-pass-1")

    apply_startup_admin_password()

    assert get_admin_store().is_configured()
    assert ensure_setup_code() is None
    assert not setup_code_path().exists()
