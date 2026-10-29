"""Admin auth endpoints: status, setup, login, logout, password change (CLV-9).

All endpoints here are same-origin-checked by the Host/Origin middleware and are
registered by :func:`app.security.install.install_security` at prefix ``/api``.
"""

from fastapi import APIRouter, HTTPException, Request, Response
from loguru import logger
from pydantic import BaseModel

from app.security.admin_auth import (
    COOKIE_MAX_AGE,
    COOKIE_NAME,
    PasswordTooShort,
    get_admin_store,
    login_limiter,
)
from app.security.route_policy import admin_error, is_admin

router = APIRouter()


class PasswordBody(BaseModel):
    password: str


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


@router.get("/auth/status")
async def auth_status(request: Request):
    """Whether an admin password exists and whether this client has a session."""
    store = get_admin_store()
    return {"configured": store.is_configured(), "authenticated": is_admin(request)}


@router.post("/auth/setup")
async def auth_setup(body: PasswordBody, request: Request, response: Response):
    """First-run claim: only while no password is configured."""
    wait = login_limiter.check(_client_ip(request))
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
    logger.info("Admin password configured (first run)")
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
    if not is_admin(request):
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
