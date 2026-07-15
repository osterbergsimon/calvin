"""Middleware that stamps every response with the kiosk CSP header."""

from loguru import logger
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.services.csp import (
    build_csp,
    get_allowed_origins,
    get_plugin_browser_origins,
    get_web_service_origins,
)


def _is_csp_exempt(path: str) -> bool:
    """Return True for paths that must NOT receive the kiosk CSP header.

    The Swagger UI (/docs) and ReDoc (/redoc) load JS/CSS from cdn.jsdelivr.net
    and run an inline bootstrap script — both are blocked by the strict
    'self'-only policy. These paths are never kiosk-facing so we simply skip
    CSP stamping on them. /openapi.json is the machine-readable schema consumed
    by those UIs and also needs to remain unrestricted.
    """
    return (
        path == "/docs"
        or path == "/redoc"
        or path.startswith("/docs/")
        or path.startswith("/openapi")
    )


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        # Docs UI paths are exempt — they need CDN assets + inline scripts.
        if _is_csp_exempt(request.url.path):
            return response
        try:
            frame_origins = await get_web_service_origins()
            allowed = await get_allowed_origins()
            plugin_origins = await get_plugin_browser_origins()
        except Exception:
            # A CSP header must never fail the response. On any DB/registry hiccup
            # fall back to the baseline self-only policy rather than 500-ing.
            logger.warning("CSP origins lookup failed; falling back to baseline self-only policy")
            frame_origins, allowed, plugin_origins = [], [], []
        response.headers["Content-Security-Policy"] = build_csp(
            frame_origins, [*allowed, *plugin_origins]
        )
        return response
