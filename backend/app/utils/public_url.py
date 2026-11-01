"""The public base URL this server is reached at (CLV-34).

The backend often sees a plain-http request even when clients reach it over
HTTPS through a TLS-terminating reverse proxy. The kiosk installer bakes this
URL in (and prints it in every switch-stack hint), so the request URL alone is
not good enough there.

Precedence:

1. ``PUBLIC_URL`` — set by the admin, authoritative.
2. ``X-Forwarded-Proto`` / ``X-Forwarded-Host`` — only when the peer is one of
   ``CALVIN_TRUSTED_PROXIES`` (comma-separated IPs/CIDRs, ``*`` for any). A
   forwarded header from an arbitrary client is never trusted.
3. the request URL itself.
"""

import ipaddress
import re

from starlette.requests import Request

from app.config import settings

# Baked into a bash single-quoted string downstream; allow only plain URL chars.
_HOST_RE = re.compile(r"[A-Za-z0-9.\-\[\]:]+")
_SAFE_SCHEMES = ("http", "https")


def _entries(trusted_proxies: str) -> list[str]:
    return [entry.strip() for entry in (trusted_proxies or "").split(",") if entry.strip()]


def _is_trusted_proxy(client_host: str | None, trusted_proxies: str) -> bool:
    """Whether the peer may set forwarded headers (an IP/CIDR allowlist)."""
    entries = _entries(trusted_proxies)
    if not entries:
        return False
    if "*" in entries:
        return True
    if not client_host:
        return False
    try:
        address = ipaddress.ip_address(client_host)
    except ValueError:
        return False
    for entry in entries:
        try:
            if address in ipaddress.ip_network(entry, strict=False):
                return True
        except ValueError:
            continue
    return False


def _first(value: str | None) -> str:
    """First hop of a comma-separated header (what the client-facing proxy set)."""
    return (value or "").split(",", 1)[0].strip()


def resolve_public_base_url(
    *,
    public_url: str,
    request_scheme: str,
    request_host: str,
    client_host: str | None,
    forwarded_proto: str | None,
    forwarded_host: str | None,
    trusted_proxies: str,
) -> str:
    """Pure precedence rule; see the module docstring."""
    if public_url:
        return public_url.rstrip("/")

    scheme = (request_scheme or "").lower()
    host = request_host or ""
    if _is_trusted_proxy(client_host, trusted_proxies):
        proto = _first(forwarded_proto).lower()
        if proto in _SAFE_SCHEMES:
            scheme = proto
        forwarded = _first(forwarded_host)
        if forwarded and _HOST_RE.fullmatch(forwarded):
            host = forwarded
    return f"{scheme}://{host}".rstrip("/")


def public_base_url(request: Request) -> str:
    """The base URL (no trailing slash) to advertise to kiosks/phones for this request."""
    return resolve_public_base_url(
        public_url=settings.public_url,
        request_scheme=request.url.scheme,
        request_host=request.url.netloc,
        client_host=request.client.host if request.client else None,
        forwarded_proto=request.headers.get("x-forwarded-proto"),
        forwarded_host=request.headers.get("x-forwarded-host"),
        trusted_proxies=settings.trusted_proxies,
    )


def client_ip(client_host: str | None, forwarded_for: str | None, trusted_proxies: str) -> str:
    """The caller's IP for rate limits: the peer, or behind a trusted proxy the forwarded one.

    ``X-Forwarded-For`` is only read when the peer is in ``CALVIN_TRUSTED_PROXIES``.
    Hops are read right to left, skipping trusted proxies, so the first untrusted
    hop is the client the nearest proxy saw; a hop that is not an IP is never used.
    """
    peer = client_host or "unknown"
    if not forwarded_for or not _is_trusted_proxy(client_host, trusted_proxies):
        return peer
    hops = [hop.strip() for hop in forwarded_for.split(",") if hop.strip()]
    for hop in reversed(hops):
        try:
            ipaddress.ip_address(hop)
        except ValueError:
            return peer
        if not _is_trusted_proxy(hop, trusted_proxies) or "*" in _entries(trusted_proxies):
            return hop
    return hops[0] if hops else peer
