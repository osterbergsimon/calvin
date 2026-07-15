"""Content-Security-Policy construction for the kiosk single-attack-surface model.

The kiosk browser must only ever connect to the Calvin server ('self') plus the
origins of the operator's own configured web-service (iframe) embeds. See
docs/superpowers/specs/2026-07-15-offline-kiosks-csp-design.md.
"""

import re
from urllib.parse import urlsplit

from app.models.db_models import PluginDB

# Baseline directives. frame-src is appended per-request with configured origins.
_BASELINE = [
    "default-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "font-src 'self' data:",
    "script-src 'self'",
    # Vue/Vite inject inline styles; without 'unsafe-inline' the dashboard breaks.
    "style-src 'self' 'unsafe-inline'",
    "base-uri 'self'",
    "form-action 'self'",
    # Prevents other sites from iframing the kiosk; default-src does NOT cover frame-ancestors.
    "frame-ancestors 'self'",
]


def origin_from_url(url: str | None) -> str | None:
    """Reduce a URL to its CSP origin ('scheme://host[:port]'), or None.

    Only http and https schemes are accepted; any other scheme (e.g. ftp)
    returns None so operator-mistyped URLs never become frame-src tokens.
    """
    if not url:
        return None
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.netloc:
        return None
    return f"{parts.scheme}://{parts.netloc}"


# A CSP host-source: optional leading "*." wildcard, dot-separated labels, optional :port.
# Accepts domains and bare IPv4 hosts (over-strict IP validation is unnecessary — CSP
# treats the value as an opaque host token).
_HOST_SOURCE_RE = re.compile(
    r"^(?:\*\.)?"
    r"(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*"
    r"[a-z0-9](?:[a-z0-9-]*[a-z0-9])?"
    r"(?::\d{1,5})?$"
)


def validate_origin(value: str) -> str:
    """Normalize a trusted-origin string or raise ValueError with a reason.

    Accepts CSP host-sources: 'grafana.lab', '*.lab.example.com',
    'host:port', and 'http(s)://host[:port]'. Rejects CIDR/IP-ranges,
    paths, spaces, non-http(s) schemes, and empties.
    """
    if not value or not value.strip():
        raise ValueError("Origin must not be empty")
    raw = value.strip()

    scheme = ""
    host_part = raw
    if "://" in raw:
        scheme, host_part = raw.split("://", 1)
        scheme = scheme.lower()
        if scheme not in ("http", "https"):
            raise ValueError(f"Unsupported scheme '{scheme}://' — use http:// or https://")

    if "/" in host_part:
        raise ValueError(
            "IP ranges (CIDR) and paths are not supported — use a domain, a wildcard "
            "like *.lab.example.com, or host:port"
        )
    if any(c in host_part for c in " \t?#"):
        raise ValueError("Origin must not contain spaces, query, or fragment")

    host_lower = host_part.lower()
    if not _HOST_SOURCE_RE.match(host_lower):
        raise ValueError(f"'{value}' is not a valid domain, wildcard, or host")

    return f"{scheme}://{host_lower}" if scheme else host_lower


def is_valid_origin(value: str) -> bool:
    """True iff validate_origin accepts the value."""
    try:
        validate_origin(value)
        return True
    except (ValueError, TypeError):
        return False


def build_csp(frame_origins: list[str]) -> str:
    """Build the full CSP header value with frame-src = 'self' + given origins."""
    seen: list[str] = []
    for origin in frame_origins:
        if origin and origin not in seen:
            seen.append(origin)
    frame_src = " ".join(["frame-src 'self'", *seen]).rstrip()
    return "; ".join([*_BASELINE, frame_src])


async def get_web_service_origins() -> list[str]:
    """Distinct origins of enabled built-in web-service (iframe) instances."""
    instances = await PluginDB.objects.filter(type_id="iframe", enabled=True).all()
    origins: set[str] = set()
    for instance in instances:
        url = (instance.config or {}).get("url") if instance.config else None
        origin = origin_from_url(url)
        if origin:
            origins.add(origin)
    return sorted(origins)
