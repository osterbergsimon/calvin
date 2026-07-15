"""Middleware that stamps every response with the kiosk CSP header."""

from loguru import logger
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.services.csp import build_csp, get_web_service_origins


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        try:
            origins = await get_web_service_origins()
        except Exception:
            # A CSP header must never fail the response. On any DB hiccup fall
            # back to the baseline self-only policy rather than 500-ing.
            logger.warning("CSP origins lookup failed; falling back to baseline self-only policy")
            origins = []
        response.headers["Content-Security-Policy"] = build_csp(origins)
        return response
