"""Content-Security-Policy construction for the kiosk single-attack-surface model.

The kiosk browser must only ever connect to the Calvin server ('self') plus the
origins of the operator's own configured web-service (iframe) embeds. See
docs/superpowers/specs/2026-07-15-offline-kiosks-csp-design.md.
"""

import re
from urllib.parse import urlsplit

from app.models.db_models import PluginDB
from app.services.config_service import config_service

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


def _dedupe(origins: list[str]) -> list[str]:
    """Return origins with falsy values and duplicates removed, order preserved."""
    seen: list[str] = []
    for origin in origins:
        if origin and origin not in seen:
            seen.append(origin)
    return seen


def build_csp(frame_origins: list[str], allowed_origins: list[str] | None = None) -> str:
    """Build the CSP header value.

    frame_origins (auto-derived web-service embeds) extend frame-src only.
    allowed_origins (admin allowlist) are trusted broadly and extend
    frame-src, img-src, and connect-src. With no allowlist the output is
    byte-identical to the Phase-1 baseline-plus-frame-src policy.
    """
    allowed = _dedupe(allowed_origins or [])
    directives: list[str] = []
    for directive in _BASELINE:
        if allowed and directive.startswith("img-src"):
            directives.append(" ".join([directive, *allowed]))
        elif allowed and directive.startswith("connect-src"):
            directives.append(" ".join([directive, *allowed]))
        else:
            directives.append(directive)
    frame = _dedupe([*frame_origins, *allowed])
    frame_src = " ".join(["frame-src 'self'", *frame]).rstrip()
    return "; ".join([*directives, frame_src])


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


async def get_allowed_origins() -> list[str]:
    """Admin-configured trusted origins (security_allowed_origins), validated.

    Any stored entry that fails validation is dropped so a hand-edited or
    corrupt config can never emit a malformed CSP token.
    """
    raw = await config_service.get_value("security_allowed_origins", [])
    if not isinstance(raw, list):
        return []
    result: list[str] = []
    for entry in raw:
        try:
            normalized = validate_origin(entry)
        except (ValueError, TypeError):
            continue
        if normalized not in result:
            result.append(normalized)
    return result


async def get_plugin_browser_origins() -> list[str]:
    """Union of enabled plugins' declared browser_origins, validated.

    These are origins intrinsic to a plugin (declared in its PluginMetadata).
    Re-validated on read so a metadata value can never emit a malformed CSP
    token. plugin_manager is imported lazily to avoid a plugins<->services
    import cycle (definitions.py already imports this module's validate_origin).
    """
    from app.plugins.manager import plugin_manager

    result: list[str] = []
    for plugin in plugin_manager.get_plugins(enabled_only=True):
        metadata = getattr(plugin, "metadata", None)
        if metadata is None:
            continue
        for entry in getattr(metadata, "browser_origins", None) or []:
            try:
                normalized = validate_origin(entry)
            except (ValueError, TypeError):
                continue
            if normalized not in result:
                result.append(normalized)
    return result
