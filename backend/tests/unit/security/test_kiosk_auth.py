"""The kiosk principal: a screen's own secret or its signed cookie (calvin-0xns)."""

import time

import pytest
from starlette.requests import Request

from app.config import settings
from app.security import kiosk_auth
from app.security.admin_auth import COOKIE_NAME, get_admin_store
from app.security.kiosk_auth import (
    KIOSK_COOKIE,
    issue_kiosk_cookie,
    kiosk_holder,
    kiosk_principal,
    read_kiosk_cookie,
)
from app.services import kiosk_registry
from app.services.kiosk_pairing import hash_secret, new_secret, pairing_store

pytestmark = [pytest.mark.asyncio, pytest.mark.unit]

PASSWORD = "test-admin-password"
COOKIE_MAX_AGE_S = 34560000


@pytest.fixture
def admin_store(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "admin_auth_path", tmp_path / "admin-auth.json")
    store = get_admin_store()
    store.set_password(PASSWORD)
    return store


@pytest.fixture(autouse=True)
def _clean_store():
    pairing_store._pending.clear()
    pairing_store._install_codes.clear()
    pairing_store._new_by_address.clear()
    yield
    pairing_store._pending.clear()
    pairing_store._install_codes.clear()
    pairing_store._new_by_address.clear()


def _request(
    path_kiosk_id: str = "kitchen",
    *,
    bearer: str | None = None,
    cookie: str | None = None,
    peer: str = "10.0.0.2",
) -> Request:
    headers = []
    if bearer is not None:
        headers.append((b"authorization", f"Bearer {bearer}".encode()))
    if cookie is not None:
        headers.append((b"cookie", f"{KIOSK_COOKIE}={cookie}".encode()))
    scope = {
        "type": "http",
        "method": "GET",
        "path": f"/api/kiosks/{path_kiosk_id}/config",
        "query_string": b"",
        "headers": headers,
        "client": (peer, 40000),
        "server": ("testserver", 80),
        "scheme": "http",
        "path_params": {"kiosk_id": path_kiosk_id},
    }
    return Request(scope)


def _at(epoch: float):
    return lambda: epoch


async def test_cookie_round_trip(admin_store):
    secret = new_secret()
    kiosk_hash = hash_secret(secret)
    value = issue_kiosk_cookie("kitchen", kiosk_hash, now=1000)
    assert value.startswith("k1.")
    assert kiosk_hash[:16] in value
    assert secret not in value
    assert read_kiosk_cookie(value) == ("kitchen", kiosk_hash[:16], 1000)


async def test_tampered_cookie_mac_is_rejected(admin_store):
    value = issue_kiosk_cookie("kitchen", hash_secret(new_secret()))
    tampered = value[:-1] + ("0" if value[-1] != "0" else "1")
    assert read_kiosk_cookie(tampered) is None
    assert read_kiosk_cookie("") is None
    assert read_kiosk_cookie("k1.garbage") is None


async def test_cookie_fingerprint_for_another_hash_is_rejected(admin_store, test_db):
    await kiosk_registry.set_credential("kitchen", hash_secret(new_secret()))
    other = issue_kiosk_cookie("kitchen", hash_secret(new_secret()))
    assert read_kiosk_cookie(other) is not None  # signed, but names another secret
    assert await kiosk_principal(_request(cookie=other)) is None


async def test_cookie_dies_on_server_secret_change(admin_store, test_db):
    secret = new_secret()
    kiosk_hash = hash_secret(secret)
    await kiosk_registry.set_credential("kitchen", kiosk_hash)
    value = issue_kiosk_cookie("kitchen", kiosk_hash)
    assert await kiosk_principal(_request(cookie=value)) == "kitchen"

    admin_store.reset()  # the documented forgot-password recovery
    admin_store.set_password(PASSWORD)  # a new server_secret
    assert read_kiosk_cookie(value) is None
    assert await kiosk_principal(_request(cookie=value)) is None


async def test_a_cookie_older_than_thirty_days_is_resigned(admin_store, test_db, monkeypatch):
    secret = new_secret()
    kiosk_hash = hash_secret(secret)
    await kiosk_registry.set_credential("kitchen", kiosk_hash)
    issued = 1_000_000
    value = issue_kiosk_cookie("kitchen", kiosk_hash, now=issued)

    monkeypatch.setattr(kiosk_auth, "_now", _at(issued + 30 * 86400 - 1))
    request = _request(cookie=value)
    assert await kiosk_principal(request) == "kitchen"
    assert getattr(request.state, "kiosk_cookie_renewed", None) is None

    later = issued + 30 * 86400 + 1
    monkeypatch.setattr(kiosk_auth, "_now", _at(later))
    request = _request(cookie=value)
    assert await kiosk_principal(request) == "kitchen"
    renewed = request.state.kiosk_cookie_renewed
    assert read_kiosk_cookie(renewed) == ("kitchen", kiosk_hash[:16], later)
    assert renewed != value


async def test_principal_is_the_screens_own_active_secret(admin_store, test_db):
    secret = new_secret()
    await kiosk_registry.set_credential("kitchen", hash_secret(secret))
    assert await kiosk_principal(_request("kitchen", bearer=secret)) == "kitchen"
    # The same secret says nothing about another screen.
    assert await kiosk_principal(_request("hall", bearer=secret)) is None


async def test_pending_or_revoked_secret_is_not_a_principal(admin_store, test_db):
    secret = new_secret()
    kiosk_hash = hash_secret(secret)
    pairing_store.start("kitchen", kiosk_hash, "10.0.0.2")
    assert await kiosk_principal(_request(bearer=secret)) is None

    pairing_store.drop_kiosk("kitchen")
    await kiosk_registry.set_credential("kitchen", kiosk_hash)
    assert await kiosk_principal(_request(bearer=secret)) == "kitchen"
    await kiosk_registry.clear_credential("kitchen")
    assert await kiosk_principal(_request(bearer=secret)) is None


async def test_cookie_works_like_the_bearer(admin_store, test_db):
    kiosk_hash = hash_secret(new_secret())
    await kiosk_registry.set_credential("kitchen", kiosk_hash)
    value = issue_kiosk_cookie("kitchen", kiosk_hash)
    assert await kiosk_principal(_request("kitchen", cookie=value)) == "kitchen"
    assert await kiosk_principal(_request("hall", cookie=value)) is None


async def test_principal_is_cached_on_the_request(admin_store, test_db):
    secret = new_secret()
    await kiosk_registry.set_credential("kitchen", hash_secret(secret))
    request = _request(bearer=secret)
    assert await kiosk_principal(request) == "kitchen"
    # A cached answer is returned even after the row changes within the request.
    await kiosk_registry.clear_credential("kitchen")
    assert await kiosk_principal(request) == "kitchen"


async def test_a_plain_api_key_is_not_a_kiosk_principal(test_db):
    assert await kiosk_principal(_request(bearer="clv_" + "x" * 43)) is None


async def test_holder_accepts_active_and_pending_secrets(admin_store, test_db):
    active = new_secret()
    active_hash = hash_secret(active)
    await kiosk_registry.set_credential("kitchen", active_hash)
    assert await kiosk_holder(_request(bearer=active)) == ("kitchen", active_hash)

    pending_secret = new_secret()
    pending = pairing_store.start("kitchen", hash_secret(pending_secret), "10.0.0.2")
    assert await kiosk_holder(_request(bearer=pending_secret)) == (
        "kitchen",
        pending.secret_hash,
    )

    pending_cookie = issue_kiosk_cookie("kitchen", pending.secret_hash)
    assert await kiosk_holder(_request("kitchen", cookie=pending_cookie)) == (
        "kitchen",
        pending.secret_hash,
    )


async def test_holder_refuses_another_screens_or_unknown_secret(admin_store, test_db):
    secret = new_secret()
    await kiosk_registry.set_credential("kitchen", hash_secret(secret))
    assert await kiosk_holder(_request("hall", bearer=secret)) is None
    assert await kiosk_holder(_request(bearer=new_secret())) is None
    assert await kiosk_holder(_request()) is None


async def test_is_admin_ignores_a_kiosk_credential(admin_store, test_db):
    from app.security.route_policy import is_admin, is_admin_session

    secret = new_secret()
    await kiosk_registry.set_credential("kitchen", hash_secret(secret))
    assert is_admin(_request(bearer=secret)) is False
    assert is_admin_session(_request(bearer=secret)) is False

    cookie = issue_kiosk_cookie("kitchen", hash_secret(secret))
    request = _request(cookie=cookie)
    assert is_admin(request) is False
    assert request.cookies.get(COOKIE_NAME) is None


async def test_cookie_attributes(admin_store):
    from fastapi import Response

    response = Response()
    value = issue_kiosk_cookie("kitchen", hash_secret(new_secret()))
    kiosk_auth.set_kiosk_cookie(response, value)
    header = response.headers["set-cookie"]
    assert header.startswith(f"{KIOSK_COOKIE}={value}")
    assert "HttpOnly" in header
    assert "SameSite=strict" in header.replace("samesite", "SameSite")
    assert "Path=/" in header
    assert f"Max-Age={COOKIE_MAX_AGE_S}" in header


async def test_now_is_the_wall_clock():
    assert abs(kiosk_auth._now() - time.time()) < 5
