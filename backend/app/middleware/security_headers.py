"""Middleware that stamps every response with the kiosk CSP header."""

from loguru import logger
from starlette.datastructures import MutableHeaders
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.services.csp import (
    build_csp,
    get_allowed_origins,
    get_plugin_browser_origins,
    get_plugin_site_origins,
    get_sealed_mode,
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


HARDENING_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
}


class HardeningHeadersMiddleware:
    """Pure-ASGI wrapper that adds the non-CSP hardening headers.

    Register it after ``install_security`` so it is outside the Host/Origin and
    guest-gate middleware and decorates their short-circuit refusals too. A
    response that already carries one of the headers keeps its own value (the
    share page sends ``Referrer-Policy: no-referrer``). Starlette's
    ServerErrorMiddleware sits outside every user middleware, so the 500 handler
    in ``app.main`` adds ``HARDENING_HEADERS`` itself.
    """

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                for name, value in HARDENING_HEADERS.items():
                    if name not in headers:
                        headers[name] = value
            await send(message)

        await self.app(scope, receive, send_with_headers)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        # Docs UI paths are exempt from CSP — they need CDN assets + inline scripts.
        if _is_csp_exempt(request.url.path):
            return response
        try:
            if await get_sealed_mode():
                # Sealed: collapse to baseline self-only — no embeds, allowlist,
                # or plugin origins reach the kiosk browser.
                frame_origins, allowed, plugin_origins = [], [], []
            else:
                frame_origins = [
                    *await get_web_service_origins(),
                    *await get_plugin_site_origins(),
                ]
                allowed = await get_allowed_origins()
                plugin_origins = await get_plugin_browser_origins()
        except Exception:
            # A CSP header must never fail the response. The fallback is already
            # the self-only shape, so a config/DB hiccup fails toward sealed.
            logger.warning("CSP origins lookup failed; falling back to baseline self-only policy")
            frame_origins, allowed, plugin_origins = [], [], []
        response.headers["Content-Security-Policy"] = build_csp(
            frame_origins, [*allowed, *plugin_origins]
        )
        return response
