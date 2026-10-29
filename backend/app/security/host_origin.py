"""Host (DNS rebinding) and Origin (cross-site write) checks (CLV-9, design §5).

Pure ASGI middleware, not ``BaseHTTPMiddleware``: the body is never read, so
SSE and streaming responses are untouched.
"""

import ipaddress
from urllib.parse import urlsplit

from starlette.datastructures import Headers
from starlette.responses import JSONResponse, PlainTextResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.security.route_policy import UNSAFE_METHODS

_ALLOWED_SUFFIXES = (".local", ".lan", ".home", ".home.arpa", ".internal", ".localdomain")
_DEFAULT_PORTS = {"http": 80, "https": 443}
_HOST_REJECTION = (
    "Calvin refused this request: the host name '{host}' is not allowed. "
    "If you reach Calvin through a domain name, add it to CALVIN_ALLOWED_HOSTS "
    "or set PUBLIC_URL."
)


def _host_name(host_header: str) -> str:
    """Host without its port, lowercased; IPv6 brackets removed."""
    value = (host_header or "").strip()
    if value.startswith("["):
        end = value.find("]")
        if end != -1:
            return value[1:end].lower()
    if value.count(":") == 1:
        return value.split(":", 1)[0].lower()
    return value.lower()


def _split_host_port(host_header: str) -> tuple[str, int | None]:
    """Return ``(host, port)`` from a Host header, with IPv6 brackets handled."""
    name = _host_name(host_header)
    value = (host_header or "").strip()
    port: int | None = None
    if value.startswith("["):
        end = value.find("]")
        remainder = value[end + 1 :] if end != -1 else ""
        if remainder.startswith(":"):
            try:
                port = int(remainder[1:])
            except ValueError:
                port = None
    elif value.count(":") == 1:
        try:
            port = int(value.split(":", 1)[1])
        except ValueError:
            port = None
    return name, port


def is_allowed_host(host_header: str, public_url: str, allowed_hosts: str) -> bool:
    """Whether a Host header is a normal LAN way of reaching Calvin (spec §5)."""
    raw = (host_header or "").strip()
    if not raw:
        # HTTP/1.0 clients on the LAN may omit it.
        return True

    entries = [entry.strip().lower() for entry in (allowed_hosts or "").split(",")]
    entries = [entry for entry in entries if entry]
    if "*" in entries:
        return True

    host = _host_name(raw)
    if not host:
        return True
    if host in {_host_name(entry) for entry in entries}:
        return True

    try:
        ipaddress.ip_address(host)
        return True
    except ValueError:
        pass

    if host == "localhost" or host.endswith(".localhost"):
        return True
    # Single-label names: "calvin", "raspberrypi".
    if "." not in host:
        return True
    if any(host.endswith(suffix) for suffix in _ALLOWED_SUFFIXES):
        return True

    if public_url:
        public_host = urlsplit(public_url).hostname
        if public_host and host == public_host.lower():
            return True
    return False


def _origin_key(origin: str) -> tuple[str, str, int | None] | None:
    parts = urlsplit((origin or "").strip())
    if not parts.scheme or not parts.hostname:
        return None
    port = parts.port
    if port is None:
        port = _DEFAULT_PORTS.get(parts.scheme.lower())
    return (parts.scheme.lower(), parts.hostname.lower(), port)


def origin_allowed(
    origin: str | None,
    sec_fetch_site: str | None,
    host_header: str,
    cors_origins: list[str],
) -> bool:
    """Whether a request may perform an unsafe method under ``/api`` (spec §5)."""
    if origin is None:
        # Non-browser clients send neither Origin nor Sec-Fetch-Site.
        return sec_fetch_site != "cross-site"
    if origin.strip().lower() == "null":
        return False

    origin_parts = urlsplit(origin.strip())
    origin_host = (origin_parts.hostname or "").lower()
    if not origin_host:
        return False
    origin_port = origin_parts.port
    default_port = _DEFAULT_PORTS.get(origin_parts.scheme.lower())
    if origin_port is None:
        origin_port = default_port

    host_name, host_port = _split_host_port(host_header or "")
    # A Host without a port means the Origin scheme's default port; any other
    # explicit port on the same hostname is a different origin.
    effective_host_port = host_port if host_port is not None else default_port
    if origin_host == host_name and origin_port == effective_host_port:
        return True

    origin_key = _origin_key(origin)
    if origin_key is None:
        return False
    return origin_key in {_origin_key(value) for value in cors_origins}


class HostOriginMiddleware:
    """Reject foreign Host headers and cross-site unsafe writes (spec §5)."""

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        from app.config import settings

        headers = Headers(scope=scope)
        host = headers.get("host", "")
        if not is_allowed_host(host, settings.public_url, settings.allowed_hosts):
            response = PlainTextResponse(
                _HOST_REJECTION.format(host=host),
                status_code=400,
            )
            await response(scope, receive, send)
            return

        method = scope.get("method", "GET").upper()
        path = scope.get("path", "")
        if method in UNSAFE_METHODS and path.startswith("/api") and not settings.cors_allow_all:
            cors_origins = [
                value.strip() for value in settings.cors_origins.split(",") if value.strip()
            ]
            if not origin_allowed(
                headers.get("origin"),
                headers.get("sec-fetch-site"),
                host,
                cors_origins,
            ):
                cross_response = JSONResponse(
                    {
                        "detail": {
                            "code": "cross_origin",
                            "message": "Cross-site requests are not allowed.",
                        }
                    },
                    status_code=403,
                )
                await cross_response(scope, receive, send)
                return

        await self.app(scope, receive, send)
