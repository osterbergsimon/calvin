"""Host and Origin checks: pure evals plus the ASGI middleware path (CLV-9)."""

import pytest
from fastapi.testclient import TestClient
from starlette.applications import Starlette
from starlette.responses import PlainTextResponse
from starlette.routing import Route

from app.config import settings
from app.security.host_origin import HostOriginMiddleware, is_allowed_host, origin_allowed


@pytest.mark.parametrize(
    "host",
    [
        "192.0.2.10:8000",
        "[fe80::1]:8000",
        "[::1]",
        "localhost:5173",
        "app.localhost",
        "calvin",
        "raspberrypi:8000",
        "calvin.local",
        "pi.home.arpa",
        "x.lan",
        "testserver",
    ],
)
def test_hosts_allowed(host):
    assert is_allowed_host(host, "", "") is True


def test_host_of_public_url_allowed():
    assert is_allowed_host("dash.example.com", "https://dash.example.com", "") is True
    assert is_allowed_host("dash.example.com:8443", "https://dash.example.com", "") is True


def test_configured_host_allowed():
    assert is_allowed_host("foo.example.org", "", "foo.example.org") is True
    assert is_allowed_host("FOO.example.org:8000", "", "bar.example.org, foo.example.org") is True


def test_star_disables_the_check():
    assert is_allowed_host("evil.example", "", "*") is True


def test_missing_host_allowed():
    assert is_allowed_host("", "", "") is True


@pytest.mark.parametrize("host", ["evil.example", "calvin.local.evil.example", "1.2.3.4.nip.io"])
def test_hosts_rejected(host):
    assert is_allowed_host(host, "", "") is False


def test_origin_same_host_port():
    assert origin_allowed("http://192.0.2.10:8080", None, "192.0.2.10:8080", []) is True


def test_origin_bare_host_uses_origin_scheme_default_port():
    # A Host without a port means the Origin scheme's default: 80 for http,
    # 443 for https. Any other port on the same hostname is a different origin.
    assert origin_allowed("http://calvin.local", None, "calvin.local", []) is True
    assert origin_allowed("https://calvin.local", None, "calvin.local", []) is True
    assert origin_allowed("http://calvin.local:80", None, "calvin.local", []) is True
    assert origin_allowed("http://calvin.local:9999", None, "calvin.local", []) is False
    assert origin_allowed("https://calvin.local:9999", None, "calvin.local", []) is False


def test_origin_ipv6_same_host_port():
    assert origin_allowed("http://[fe80::1]:8000", None, "[fe80::1]:8000", []) is True


def test_origin_default_ports():
    assert origin_allowed("https://dash.example.com", None, "dash.example.com", []) is True


def test_origin_in_cors_list():
    assert (
        origin_allowed(
            "http://localhost:5173",
            None,
            "localhost:8000",
            ["http://localhost:5173"],
        )
        is True
    )


def test_origin_absent_curl():
    assert origin_allowed(None, None, "192.0.2.10:8000", []) is True


@pytest.mark.parametrize(
    ("origin", "sec_fetch_site"),
    [("http://evil.example", None), ("null", None), (None, "cross-site")],
)
def test_origin_rejected(origin, sec_fetch_site):
    assert origin_allowed(origin, sec_fetch_site, "192.0.2.10:8000", []) is False


async def _ok(request):
    return PlainTextResponse("ok")


def _middleware_app() -> Starlette:
    app = Starlette(
        routes=[
            Route("/api/x", _ok, methods=["POST"]),
            Route("/", _ok, methods=["GET", "POST"]),
        ]
    )
    app.add_middleware(HostOriginMiddleware)
    return app


@pytest.fixture
def asgi_client(monkeypatch):
    monkeypatch.setattr(settings, "public_url", "")
    monkeypatch.setattr(settings, "allowed_hosts", "")
    monkeypatch.setattr(settings, "cors_origins", "http://localhost:5173")
    monkeypatch.setattr(settings, "cors_allow_all", False)
    with TestClient(_middleware_app()) as client:
        yield client


def test_asgi_foreign_host_400(asgi_client):
    response = asgi_client.get("/", headers={"host": "evil.example"})
    assert response.status_code == 400
    assert response.headers["content-type"].startswith("text/plain")
    assert "CALVIN_ALLOWED_HOSTS" in response.text


def test_asgi_foreign_origin_403(asgi_client):
    response = asgi_client.post("/api/x", headers={"origin": "http://evil.example"})
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "cross_origin"


def test_asgi_origin_check_skips_non_api(asgi_client):
    response = asgi_client.post("/", headers={"origin": "http://evil.example"})
    assert response.status_code == 200


def test_asgi_same_origin_passes(asgi_client):
    response = asgi_client.post("/api/x", headers={"origin": "http://testserver"})
    assert response.status_code == 200
