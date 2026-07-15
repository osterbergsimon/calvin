"""Content-Security-Policy construction for the kiosk single-attack-surface model.

The kiosk browser must only ever connect to the Calvin server ('self') plus the
origins of the operator's own configured web-service (iframe) embeds. See
docs/superpowers/specs/2026-07-15-offline-kiosks-csp-design.md.
"""

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
