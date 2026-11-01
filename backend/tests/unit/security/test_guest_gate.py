"""The guest gate refuses before any request body is read (calvin-mwqo)."""

import asyncio

import pytest

from app.config import settings
from app.security import guest_gate
from app.security.admin_auth import guest_token_limiter
from app.security.guest_gate import GuestGateMiddleware
from app.utils.public_url import client_ip


@pytest.fixture(autouse=True)
def _store(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "admin_auth_path", tmp_path / "admin-auth.json")
    monkeypatch.setattr(settings, "trusted_proxies", "")
    guest_token_limiter._failures.clear()
    guest_token_limiter._lockouts.clear()
    from app.security.share_links import get_share_link_store

    _, token = get_share_link_store().create("Grandma", "Guests")
    return token


@pytest.fixture
def token(_store):
    return _store


def _scope(path, method="POST", headers=None, client=("192.0.2.1", 5000)):
    raw = [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()]
    return {
        "type": "http",
        "method": method,
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "headers": raw,
        "client": client,
    }


def _call(scope):
    """Run the gate; the inner app and the body must not be touched on refusal."""
    sent: list[dict] = []
    reached: list[dict] = []

    async def inner(scope, receive, send):
        reached.append(scope)

    async def receive():  # pragma: no cover - reading the body is the bug
        raise AssertionError("the body was read")

    async def send(message):
        sent.append(message)

    asyncio.run(GuestGateMiddleware(inner)(scope, receive, send))
    status = next((m["status"] for m in sent if m["type"] == "http.response.start"), None)
    headers = {
        k.decode(): v.decode()
        for m in sent
        if m["type"] == "http.response.start"
        for k, v in m["headers"]
    }
    return status, headers, reached


def test_unknown_token_upload_is_refused_without_reading_the_body():
    status, _, reached = _call(
        _scope("/api/guest/nope.nope/uploads", headers={"content-length": str(10**9)})
    )
    assert status == 404
    assert reached == []


def test_unknown_token_share_target_redirects_without_reading_the_body():
    status, headers, reached = _call(
        _scope("/share/nope.nope/receive", headers={"content-length": "100"})
    )
    assert status == 303
    assert headers["location"] == "/share/nope.nope/?error=invalid"
    assert reached == []


def test_valid_token_over_the_cap_is_refused_without_reading_the_body(token):
    headers = {"content-length": str(guest_gate.MAX_GUEST_REQUEST_BYTES + 1)}
    status, _, reached = _call(_scope(f"/api/guest/{token}/uploads", headers=headers))
    assert status == 413
    assert reached == []


def test_share_target_over_the_cap_redirects_to_the_page(token):
    headers = {"content-length": str(guest_gate.MAX_GUEST_REQUEST_BYTES + 1)}
    status, headers_out, reached = _call(_scope(f"/share/{token}/receive", headers=headers))
    assert status == 303
    assert headers_out["location"] == f"/share/{token}/?error=too_large"
    assert reached == []


def test_body_without_a_length_is_refused(token):
    headers = {"transfer-encoding": "chunked"}
    status, _, reached = _call(_scope(f"/api/guest/{token}/uploads", headers=headers))
    assert status == 411
    assert reached == []


def test_valid_token_within_the_cap_reaches_the_app_with_its_link(token):
    status, _, reached = _call(
        _scope(f"/api/guest/{token}/uploads", headers={"content-length": "100"})
    )
    assert status is None
    (scope,) = reached
    assert scope["state"]["share_link"]["name"] == "Grandma"
    assert scope["state"]["guest_ip"] == "192.0.2.1"


def test_guest_get_needs_no_length(token):
    _, _, reached = _call(_scope(f"/api/guest/{token}", method="GET"))
    assert len(reached) == 1


def test_cross_site_share_target_is_refused(token):
    headers = {"content-length": "100", "sec-fetch-site": "cross-site"}
    status, _, reached = _call(_scope(f"/share/{token}/receive", headers=headers))
    assert status == 403
    assert reached == []


def test_other_paths_pass_untouched():
    for path in ("/api/share/links", "/share/abc/", "/api/images/list", "/share/abc"):
        status, _, reached = _call(_scope(path))
        assert status is None and len(reached) == 1, path


# -- client_ip ---------------------------------------------------------------


@pytest.mark.parametrize(
    "peer, forwarded, trusted, expected",
    [
        ("192.0.2.1", None, "", "192.0.2.1"),
        # Not a trusted proxy: X-Forwarded-For is a client's claim, ignored.
        ("192.0.2.1", "203.0.113.7", "", "192.0.2.1"),
        ("192.0.2.1", "203.0.113.7", "10.0.0.0/8", "192.0.2.1"),
        # Trusted proxy: the nearest untrusted hop is the client.
        ("10.0.0.2", "203.0.113.7", "10.0.0.0/8", "203.0.113.7"),
        ("10.0.0.2", "198.51.100.1, 203.0.113.7, 10.0.0.5", "10.0.0.0/8", "203.0.113.7"),
        # A garbage hop never becomes a bucket key.
        ("10.0.0.2", "not-an-ip", "10.0.0.0/8", "10.0.0.2"),
        (None, None, "", "unknown"),
    ],
)
def test_client_ip(peer, forwarded, trusted, expected):
    assert client_ip(peer, forwarded, trusted) == expected


# -- body caps (security r2) -------------------------------------------------


def test_guest_api_cap_is_one_photo_plus_margin():
    from app.services.guest_image import MAX_GUEST_UPLOAD_BYTES

    # The page sends one photo per request: the API cap is far below the
    # share target's, but still fits the largest photo and its form framing.
    assert MAX_GUEST_UPLOAD_BYTES < guest_gate.MAX_GUEST_API_REQUEST_BYTES
    assert guest_gate.MAX_GUEST_API_REQUEST_BYTES <= MAX_GUEST_UPLOAD_BYTES + 2 * 2**20
    assert guest_gate.MAX_GUEST_API_REQUEST_BYTES < guest_gate.MAX_GUEST_REQUEST_BYTES


def test_guest_api_over_its_cap_is_refused_without_reading_the_body(token):
    headers = {"content-length": str(guest_gate.MAX_GUEST_API_REQUEST_BYTES + 1)}
    status, _, reached = _call(_scope(f"/api/guest/{token}/uploads", headers=headers))
    assert status == 413
    assert reached == []


def test_guest_api_within_its_cap_reaches_the_app(token):
    headers = {"content-length": str(guest_gate.MAX_GUEST_API_REQUEST_BYTES)}
    status, _, reached = _call(_scope(f"/api/guest/{token}/uploads", headers=headers))
    assert status is None
    assert len(reached) == 1


def test_share_target_keeps_the_large_cap(token):
    # Android shares every selected photo in one request.
    headers = {"content-length": str(guest_gate.MAX_GUEST_API_REQUEST_BYTES + 1)}
    status, _, reached = _call(_scope(f"/share/{token}/receive", headers=headers))
    assert status is None
    assert len(reached) == 1
    headers = {"content-length": str(guest_gate.MAX_GUEST_REQUEST_BYTES + 1)}
    status, _, reached = _call(_scope(f"/share/{token}/receive", headers=headers))
    assert status == 303
    assert reached == []
