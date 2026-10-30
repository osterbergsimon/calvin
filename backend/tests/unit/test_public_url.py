"""The public base URL the server advertises for kiosk/installer content (CLV-34).

Behind a TLS-terminating reverse proxy the request itself is plain http; the
URL baked into the installer (and every switch-stack hint it prints) must be
the URL a kiosk can actually use.
"""

from starlette.requests import Request

from app.utils.public_url import public_base_url, resolve_public_base_url


def _resolve(**overrides):
    values = {
        "public_url": "",
        "request_scheme": "http",
        "request_host": "calvin.wholab.xyz",
        "client_host": "192.168.1.50",
        "forwarded_proto": None,
        "forwarded_host": None,
        "trusted_proxies": "",
    }
    values.update(overrides)
    return resolve_public_base_url(**values)


def test_public_url_wins_even_behind_a_plain_http_request():
    assert (
        _resolve(
            public_url="https://calvin.wholab.xyz/",
            forwarded_proto="http",
            forwarded_host="internal.example",
        )
        == "https://calvin.wholab.xyz"
    )


def test_forwarded_headers_from_a_trusted_proxy():
    assert (
        _resolve(
            trusted_proxies="127.0.0.1",
            client_host="127.0.0.1",
            forwarded_proto="https",
            forwarded_host="calvin.wholab.xyz",
        )
        == "https://calvin.wholab.xyz"
    )


def test_forwarded_proto_alone_keeps_the_request_host():
    # Proxies that pass Host through do not send X-Forwarded-Host.
    assert (
        _resolve(
            trusted_proxies="127.0.0.1",
            client_host="127.0.0.1",
            forwarded_proto="https",
        )
        == "https://calvin.wholab.xyz"
    )


def test_forwarded_headers_from_an_untrusted_client_are_ignored():
    assert (
        _resolve(
            trusted_proxies="127.0.0.1",
            client_host="203.0.113.9",
            forwarded_proto="https",
            forwarded_host="evil.example",
        )
        == "http://calvin.wholab.xyz"
    )


def test_forwarded_headers_ignored_when_no_proxy_is_configured():
    assert (
        _resolve(forwarded_proto="https", forwarded_host="calvin.wholab.xyz")
        == "http://calvin.wholab.xyz"
    )


def test_plain_request_uses_the_request_url():
    assert _resolve() == "http://calvin.wholab.xyz"


def test_trusted_cidr_and_wildcard_entries():
    proxy = {"client_host": "10.4.5.6", "forwarded_proto": "https"}
    assert _resolve(trusted_proxies="10.0.0.0/8", **proxy) == "https://calvin.wholab.xyz"
    assert _resolve(trusted_proxies="*", **proxy) == "https://calvin.wholab.xyz"


def test_malformed_forwarded_values_are_ignored():
    # Never let a forwarded header smuggle a scheme or shell characters into
    # the baked URL; fall back to the request URL piece by piece.
    assert (
        _resolve(
            trusted_proxies="127.0.0.1",
            client_host="127.0.0.1",
            forwarded_proto="javascript",
            forwarded_host="host'$(reboot)'",
        )
        == "http://calvin.wholab.xyz"
    )
    assert (
        _resolve(
            trusted_proxies="127.0.0.1",
            client_host="127.0.0.1",
            forwarded_proto="https",
            forwarded_host="ok.example, junk.example",
        )
        == "https://ok.example"
    )


def _request(headers: dict[str, str], client: tuple[str, int] | None = ("192.168.1.50", 1234)):
    raw = [(k.lower().encode(), v.encode()) for k, v in headers.items()]
    raw.append((b"host", b"calvin.wholab.xyz"))
    return Request(
        {
            "type": "http",
            "scheme": "http",
            "server": ("calvin.wholab.xyz", 80),
            "path": "/api/kiosks/install.sh",
            "query_string": b"",
            "headers": raw,
            "client": client,
        }
    )


def test_public_base_url_reads_settings_and_request(monkeypatch):
    from app.utils import public_url as module

    monkeypatch.setattr(module.settings, "public_url", "", raising=False)
    monkeypatch.setattr(module.settings, "trusted_proxies", "127.0.0.1", raising=False)

    trusted = _request(
        {"x-forwarded-proto": "https", "x-forwarded-host": "calvin.wholab.xyz"},
        client=("127.0.0.1", 5000),
    )
    assert public_base_url(trusted) == "https://calvin.wholab.xyz"

    untrusted = _request(
        {"x-forwarded-proto": "https", "x-forwarded-host": "calvin.wholab.xyz"},
        client=("203.0.113.9", 5000),
    )
    assert public_base_url(untrusted) == "http://calvin.wholab.xyz"

    monkeypatch.setattr(module.settings, "public_url", "https://calvin.wholab.xyz/", raising=False)
    assert public_base_url(untrusted) == "https://calvin.wholab.xyz"
