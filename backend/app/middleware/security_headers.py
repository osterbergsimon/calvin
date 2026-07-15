"""Middleware that stamps every response with the kiosk CSP header."""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.services.csp import build_csp, get_web_service_origins


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        origins = await get_web_service_origins()
        response.headers["Content-Security-Policy"] = build_csp(origins)
        return response
