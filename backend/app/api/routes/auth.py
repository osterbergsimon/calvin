"""Admin auth endpoints: status, setup, login, logout, password change (CLV-9).

All endpoints here are same-origin-checked by the Host/Origin middleware and are
registered by :func:`app.security.install.install_security` at prefix ``/api``.
"""

import ipaddress
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from loguru import logger
from pydantic import BaseModel, field_validator

from app.security.admin_auth import (
    COOKIE_MAX_AGE,
    COOKIE_NAME,
    PasswordTooShort,
    get_admin_store,
    login_limiter,
)
from app.security.api_keys import MAX_NAME_LEN, DuplicateKeyName, get_api_key_store
from app.security.route_policy import admin_error, is_admin_session, request_api_key
from app.security.setup_code import (
    current_setup_code,
    ensure_setup_code,
    format_code,
    invalidate_setup_code,
    verify_setup_code,
)
from app.utils.host_control import host_control_enabled

router = APIRouter()


class PasswordBody(BaseModel):
    password: str


class SetupBody(BaseModel):
    password: str
    # Required: a body without a code is a 422, before anything can be claimed.
    code: str


class ChangePasswordBody(BaseModel):
    current: str
    new: str


def _client_ip(request: Request) -> str:
    """Peer IP only; ``X-Forwarded-*`` is never trusted (design §5)."""
    return request.client.host if request.client else "unknown"


def _rate_limited(wait: int) -> HTTPException:
    return HTTPException(
        status_code=429,
        detail={
            "code": "rate_limited",
            "message": f"Too many attempts. Try again in {wait} seconds.",
            "retry_after": wait,
        },
        headers={"Retry-After": str(wait)},
    )


def _set_admin_cookie(response: Response, value: str) -> None:
    response.set_cookie(
        COOKIE_NAME,
        value,
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        samesite="strict",
        path="/",
        secure=False,
    )


# A local reverse proxy makes every visitor's peer loopback. If the request
# carries any proxy header it came through (or a client tried to look like it
# did), so it is never a trusted loopback caller.
_PROXY_HEADERS = (
    "forwarded",
    "x-forwarded-for",
    "x-forwarded-host",
    "x-forwarded-proto",
    "x-real-ip",
)


def _is_loopback(request: Request) -> bool:
    """True only for a direct loopback peer with no proxy headers at all.

    ``X-Forwarded-*``/``Forwarded`` is never trusted (design §5). Uvicorn may
    rewrite ``request.client`` from ``X-Forwarded-For`` when a local proxy is
    trusted, so the header check comes first and does not depend on that.
    """
    if any(header in request.headers for header in _PROXY_HEADERS):
        return False
    host = request.client.host if request.client else ""
    if not host:
        return False
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return host == "localhost"


@router.get("/auth/status")
async def auth_status(request: Request):
    """Whether an admin password exists and whether this client has a session."""
    store = get_admin_store()
    return {"configured": store.is_configured(), "authenticated": is_admin_session(request)}


@router.get("/auth/setup-code")
async def auth_setup_code(request: Request):
    """The one-time setup code, only to the server itself (loopback).

    A kiosk on the same machine can show it on its setup screen. Everything
    else is refused so the code never reaches the LAN: use the server log or
    ``<data dir>/setup-code.txt`` instead.
    """
    if not _is_loopback(request):
        raise HTTPException(
            status_code=403,
            detail={
                "code": "loopback_only",
                "message": "The setup code is only available on the server itself.",
            },
        )
    if get_admin_store().is_configured():
        raise HTTPException(
            status_code=404,
            detail={
                "code": "already_configured",
                "message": "An admin password is already configured.",
            },
        )
    code = ensure_setup_code()
    if not code:
        raise HTTPException(
            status_code=404,
            detail={"code": "no_setup_code", "message": "No setup code is available."},
        )
    return {"code": format_code(code)}


@router.post("/auth/setup")
async def auth_setup(body: SetupBody, request: Request, response: Response):
    """First-run claim: only with the one-time code while no password exists."""
    ip = _client_ip(request)
    wait = login_limiter.check(ip)
    if wait:
        raise _rate_limited(wait)
    store = get_admin_store()
    if store.is_configured():
        raise HTTPException(
            status_code=409,
            detail={
                "code": "already_configured",
                "message": "An admin password is already configured.",
            },
        )
    # A process started without the lifespan (tests) still gets a valid code.
    ensure_setup_code()
    if not verify_setup_code(body.code):
        login_limiter.record_failure(ip)
        code = current_setup_code()
        logger.warning(
            "Setup attempt rejected from {}: wrong setup code. Calvin setup code: {}",
            ip,
            format_code(code) if code else "(unavailable)",
        )
        raise HTTPException(
            status_code=403,
            detail={
                "code": "bad_setup_code",
                "message": "Wrong setup code. Find it in Calvin's server log.",
            },
        )
    try:
        store.set_password(body.password)
    except PasswordTooShort:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "password_too_short",
                "message": "The admin password must be at least 8 characters.",
            },
        ) from None
    invalidate_setup_code()
    login_limiter.record_success(ip)
    logger.info("Admin password configured (first run); setup code invalidated")
    _set_admin_cookie(response, store.issue_cookie())
    return {"ok": True}


@router.post("/auth/login")
async def auth_login(body: PasswordBody, request: Request, response: Response):
    """Verify the password; only wrong passwords count toward the rate limit."""
    ip = _client_ip(request)
    wait = login_limiter.check(ip)
    if wait:
        raise _rate_limited(wait)
    store = get_admin_store()
    if not store.is_configured():
        raise admin_error(False)
    if not store.verify_password(body.password):
        login_limiter.record_failure(ip)
        logger.warning("Admin login failed from {}", ip)
        raise HTTPException(
            status_code=401,
            detail={"code": "bad_password", "message": "Wrong admin password."},
        )
    login_limiter.record_success(ip)
    _set_admin_cookie(response, store.issue_cookie())
    return {"ok": True}


@router.post("/auth/logout")
async def auth_logout(response: Response):
    """Clear the cookie. The stateless cookie needs no server-side session."""
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@router.post("/auth/password")
async def auth_change_password(body: ChangePasswordBody, request: Request, response: Response):
    """Change the password; the generation bump signs every other session out."""
    ip = _client_ip(request)
    wait = login_limiter.check(ip)
    if wait:
        raise _rate_limited(wait)
    store = get_admin_store()
    if not is_admin_session(request):
        if request_api_key(request) is not None:
            raise _session_required()
        raise admin_error(store.is_configured())
    if not store.verify_password(body.current):
        login_limiter.record_failure(ip)
        logger.warning("Admin password change rejected from {}", ip)
        raise HTTPException(
            status_code=401,
            detail={"code": "bad_password", "message": "Wrong admin password."},
        )
    try:
        store.set_password(body.new)
    except PasswordTooShort:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "password_too_short",
                "message": "The admin password must be at least 8 characters.",
            },
        ) from None
    login_limiter.record_success(ip)
    logger.info("Admin password changed; other sessions signed out")
    _set_admin_cookie(response, store.issue_cookie())
    return {"ok": True}


# -- API keys (CLV-32) --------------------------------------------------------


class CreateKeyBody(BaseModel):
    name: str
    scope: Literal["read", "admin", "host"]

    @field_validator("name")
    @classmethod
    def _name_ok(cls, value: str) -> str:
        value = value.strip()
        if not value or len(value) > MAX_NAME_LEN:
            raise ValueError(f"Name must be 1 to {MAX_NAME_LEN} characters")
        return value


def _session_required() -> HTTPException:
    return HTTPException(
        status_code=403,
        detail={
            "code": "session_required",
            "message": "API keys can only be managed from an admin session, not with a key.",
        },
    )


async def require_admin_session(request: Request) -> None:
    """Key management needs the admin cookie; no key, whatever its scope, qualifies."""
    if request_api_key(request) is not None:
        raise _session_required()
    if not is_admin_session(request):
        raise admin_error(get_admin_store().is_configured())


@router.get("/auth/keys", dependencies=[Depends(require_admin_session)])
async def list_api_keys():
    """Active keys, newest first. Never the secret or its hash."""
    return {"keys": get_api_key_store().list()}


@router.post("/auth/keys", status_code=201, dependencies=[Depends(require_admin_session)])
async def create_api_key(body: CreateKeyBody):
    """Mint a key. The response is the only time the secret is ever sent."""
    if body.scope == "host" and not host_control_enabled():
        raise HTTPException(
            status_code=403,
            detail={
                "code": "host_control_disabled",
                "message": "Host control keys are unavailable: this Calvin doesn't control its machine.",
            },
        )
    try:
        record, secret = get_api_key_store().create(body.name, body.scope)
    except DuplicateKeyName:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "duplicate_name",
                "message": f"You already have a key called {body.name}.",
            },
        ) from None
    logger.info("API key created: {} ({}, {})", record["name"], record["scope"], record["prefix"])
    return {"key": record, "secret": secret}


@router.delete(
    "/auth/keys/{key_id}", status_code=204, dependencies=[Depends(require_admin_session)]
)
async def revoke_api_key(key_id: str):
    """Revoke at once; the next request with that key is a 401."""
    if not get_api_key_store().revoke(key_id):
        raise HTTPException(
            status_code=404,
            detail={"code": "key_not_found", "message": "No such API key."},
        )
    logger.info("API key revoked: {}", key_id)
    return Response(status_code=204)
