"""Share-link gate: check the token before any guest request body is read (calvin-mwqo).

The route policy is an app dependency, and FastAPI parses a multipart form
before it runs dependencies, so a stranger with no link could make Calvin spool
an upload of any size to disk before being turned away. This pure ASGI
middleware runs first on the guest paths (``/api/guest/{token}/*`` and the Web
Share Target action ``/share/{token}/receive``):

* an unknown, revoked or expired token is refused (404, or a redirect back to
  the page for the share target), and only failures count toward the per-IP
  limit, so a valid token always gets through;
* a body needs a ``Content-Length`` no larger than ``MAX_GUEST_REQUEST_BYTES``;
* the share target refuses ``Sec-Fetch-Site: cross-site``.

The resolved link is put on ``request.state.share_link`` for the handlers.
"""

import re
from typing import Any
from urllib.parse import quote

from loguru import logger
from starlette.datastructures import Headers
from starlette.responses import JSONResponse, RedirectResponse, Response
from starlette.types import ASGIApp, Receive, Scope, Send

from app.security.admin_auth import guest_token_limiter

# One share-target request may carry many photos (Android shares them all at
# once); the page itself sends one photo per request. Keep the Caddy example's
# request_body max_size in docs/configuration/SHARE_LINKS.md in step.
MAX_GUEST_REQUEST_BYTES = 256 * 1024 * 1024

_GUEST_API = re.compile(r"^/api/guest/(?P<token>[^/]+)(?:/.*)?$")
_SHARE_TARGET = re.compile(r"^/share/(?P<token>[^/]+)/receive$")
_BODY_METHODS = frozenset({"POST", "PUT", "PATCH"})


def share_page(token: str, query: str) -> str:
    """The guest page URL for a redirect; the token is quoted for the header."""
    return f"/share/{quote(token, safe='')}/?{query}"


class GuestRefusal(Exception):  # noqa: N818 - a refusal, not an error
    """Why a guest request is turned away: status, error body and headers."""

    def __init__(self, status: int, code: str, message: str, headers: dict[str, str] | None = None):
        super().__init__(code)
        self.status = status
        self.code = code
        self.message = message
        self.headers = headers or {}

    @property
    def detail(self) -> dict[str, Any]:
        detail: dict[str, Any] = {"code": self.code, "message": self.message}
        if "Retry-After" in self.headers:
            detail["retry_after"] = int(self.headers["Retry-After"])
        return detail


def resolve_guest(token: str, ip: str) -> dict[str, Any]:
    """The link for ``token``, or raise :class:`GuestRefusal` (404 / 429).

    A valid token is never refused here, whatever the IP's history: only
    failures are counted, and a lockout only answers further failures.
    """
    from app.security.share_links import get_share_link_store

    link = get_share_link_store().authenticate(token)
    if link is not None:
        return link
    wait = guest_token_limiter.check(ip)
    if wait:
        raise GuestRefusal(
            429,
            "rate_limited",
            f"Too many attempts. Try again in {wait} seconds.",
            {"Retry-After": str(wait)},
        )
    guest_token_limiter.record_failure(ip)
    # Never the token itself: tokens are not logged.
    logger.warning("Unknown, revoked or expired share link from {}", ip)
    raise GuestRefusal(
        404, "share_link_invalid", "This link doesn't work any more. Ask for a new one."
    )


def guest_ip(scope: Scope) -> str:
    from app.config import settings
    from app.utils.public_url import client_ip

    client = scope.get("client")
    headers = Headers(scope=scope)
    return client_ip(
        client[0] if client else None,
        headers.get("x-forwarded-for"),
        settings.trusted_proxies,
    )


def _check_body(headers: Headers) -> None:
    length = headers.get("content-length")
    if length is None:
        raise GuestRefusal(411, "length_required", "Send the photos as a normal upload.")
    try:
        size = int(length)
    except ValueError:
        raise GuestRefusal(400, "bad_request", "Send the photos as a normal upload.") from None
    if size > MAX_GUEST_REQUEST_BYTES:
        raise GuestRefusal(
            413,
            "too_large",
            f"Too much at once. Send at most {MAX_GUEST_REQUEST_BYTES // 2**20} MB at a time.",
        )


class GuestGateMiddleware:
    """Refuse bad guest requests before the body is read; see the module docstring."""

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        path = scope.get("path", "")
        method = scope.get("method", "GET").upper()
        match = _GUEST_API.match(path)
        share_target = False
        if match is None:
            match = _SHARE_TARGET.match(path) if method == "POST" else None
            if match is None:
                await self.app(scope, receive, send)
                return
            share_target = True

        token = match.group("token")
        ip = guest_ip(scope)
        headers = Headers(scope=scope)
        try:
            link = resolve_guest(token, ip)
            if share_target and headers.get("sec-fetch-site") == "cross-site":
                raise GuestRefusal(403, "cross_origin", "Cross-site requests are not allowed.")
            if method in _BODY_METHODS:
                _check_body(headers)
        except GuestRefusal as refusal:
            response: Response
            if share_target and refusal.status != 403:
                error = "invalid" if refusal.status in (404, 429) else refusal.code
                response = RedirectResponse(share_page(token, f"error={error}"), status_code=303)
            else:
                response = JSONResponse(
                    {"detail": refusal.detail}, status_code=refusal.status, headers=refusal.headers
                )
            await response(scope, receive, send)
            return

        state = scope.setdefault("state", {})
        state["share_link"] = link
        state["guest_ip"] = ip
        await self.app(scope, receive, send)
