"""The kiosk principal: a screen proving which screen it is (calvin-0xns).

A screen's own secret (``Authorization: Bearer clv_kiosk_…``), or the signed
``calvin_kiosk`` cookie the browser swapped it for, resolves the kiosk id in the
path to that screen. A kiosk credential is never an admin session and never an
API key; a bad, revoked or pending one is simply "no credential".
"""

import hashlib
import hmac
import re
import time

from fastapi import HTTPException, Request, Response
from loguru import logger

from app.security.admin_auth import LoginRateLimiter, get_admin_store
from app.security.route_policy import bearer_secret
from app.services.kiosk_pairing import fingerprint, hash_secret, is_secret, pairing_store
from app.services.kiosk_registry import get_credential_hash, valid_kiosk_id

KIOSK_COOKIE = "calvin_kiosk"
COOKIE_MAX_AGE_S = 34560000  # 400 days, as the design fixes
COOKIE_RENEW_AFTER_S = 30 * 24 * 3600
COOKIE_CLOCK_SKEW_S = 60  # accept a clock this far fast, like read_session
_COOKIE_VERSION = "k1"
_FINGERPRINT_RE = re.compile(r"^[0-9a-f]{16}$")
_HEX_ID_RE = re.compile(r"^(?:[0-9a-f]{2})+$")
_ISSUED_RE = re.compile(r"^[0-9]{1,12}$")
_MAC_RE = re.compile(r"^[0-9a-f]{64}$")

# Wrong kiosk secrets get their own bucket: a 256-bit secret cannot be guessed,
# so this only keeps the log quiet.
kiosk_secret_limiter = LoginRateLimiter()

_MISSING = object()


def _now() -> float:
    return time.time()


def _server_secret() -> bytes | None:
    """The admin store's ``server_secret``; None while no admin password exists."""
    data = get_admin_store()._load()
    if data is None:
        return None
    try:
        return bytes.fromhex(data["server_secret"])
    except (KeyError, TypeError, ValueError):
        return None


def _mac(secret: bytes, body: str) -> str:
    return hmac.new(secret, body.encode(), hashlib.sha256).hexdigest()


def issue_kiosk_cookie(kiosk_id: str, secret_hash: str, now: int | float | None = None) -> str:
    """A signed ``k1.<id>.<fingerprint>.<issued>.<mac>`` cookie for one screen."""
    secret = _server_secret()
    if secret is None:
        raise RuntimeError("Admin auth is not configured")
    issued = int(_now() if now is None else now)
    body = f"{_COOKIE_VERSION}.{kiosk_id.encode().hex()}.{fingerprint(secret_hash)}.{issued}"
    return f"{body}.{_mac(secret, body)}"


def set_kiosk_cookie(response: Response, value: str) -> None:
    """Attach the kiosk cookie with the attributes the design fixes."""
    response.set_cookie(
        KIOSK_COOKIE,
        value,
        max_age=COOKIE_MAX_AGE_S,
        httponly=True,
        samesite="strict",
        path="/",
        secure=False,
    )


def read_kiosk_cookie(value: str | None, now: float | None = None) -> tuple[str, str, int] | None:
    """``(kiosk_id, fingerprint, issued)`` for a live, untampered cookie, else None.

    Every part is shape-checked before ``hmac.compare_digest``, which raises
    ``TypeError`` on a non-ASCII string: a garbled cookie from the wire is "no
    credential", never a 500. A cookie older than :data:`COOKIE_MAX_AGE_S`, or
    issued more than :data:`COOKIE_CLOCK_SKEW_S` in the future, is refused just
    like :meth:`AdminAuthStore.read_session` does for the admin cookie.
    """
    if not value:
        return None
    parts = value.split(".")
    if len(parts) != 5 or parts[0] != _COOKIE_VERSION:
        return None
    if (
        not _HEX_ID_RE.fullmatch(parts[1])
        or not _FINGERPRINT_RE.fullmatch(parts[2])
        or not _ISSUED_RE.fullmatch(parts[3])
        or not _MAC_RE.fullmatch(parts[4])
    ):
        return None
    secret = _server_secret()
    if secret is None:
        return None
    body = ".".join(parts[:4])
    if not hmac.compare_digest(_mac(secret, body), parts[4]):
        return None
    try:
        kiosk_id = bytes.fromhex(parts[1]).decode()
    except (ValueError, UnicodeDecodeError):
        return None
    if not kiosk_id:
        return None
    issued = int(parts[3])
    current = _now() if now is None else now
    if issued > current + COOKIE_CLOCK_SKEW_S:
        return None
    if current - issued > COOKIE_MAX_AGE_S:
        return None
    return (kiosk_id, parts[2], issued)


def _path_kiosk_id(request: Request) -> str | None:
    kiosk_id = request.path_params.get("kiosk_id") if request.path_params else None
    return kiosk_id if isinstance(kiosk_id, str) and valid_kiosk_id(kiosk_id) else None


def _record_bad_secret(request: Request, kiosk_id: str) -> None:
    ip = request.client.host if request.client else "unknown"
    if kiosk_secret_limiter.check(ip) == 0:
        logger.debug(f"A kiosk secret did not match screen {kiosk_id!r}")
    kiosk_secret_limiter.record_failure(ip)


def _renew_if_due(request: Request, kiosk_id: str, secret_hash: str, issued: int) -> None:
    now = _now()
    if now - issued > COOKIE_RENEW_AFTER_S:
        request.state.kiosk_cookie_renewed = issue_kiosk_cookie(kiosk_id, secret_hash, now=now)


def renew_kiosk_cookie(request: Request, response: Response) -> None:
    """Send a re-signed cookie when :func:`kiosk_principal` found one due."""
    value = getattr(request.state, "kiosk_cookie_renewed", None)
    if value:
        set_kiosk_cookie(response, value)


async def kiosk_principal(request: Request) -> str | None:
    """The path's kiosk id when the caller holds that screen's active secret.

    Resolved once per request and cached on ``request.state``; requests that
    never ask for it pay nothing. A revoked, pending or wrong secret, or a
    cookie for another secret, is "no credential" and never an error.
    """
    cached = getattr(request.state, "kiosk_principal_cache", _MISSING)
    if cached is not _MISSING:
        return cached if isinstance(cached, str) else None
    principal = await _resolve_principal(request)
    request.state.kiosk_principal_cache = principal
    return principal


async def _resolve_principal(request: Request) -> str | None:
    kiosk_id = _path_kiosk_id(request)
    if kiosk_id is None:
        return None
    active = await get_credential_hash(kiosk_id)

    secret = bearer_secret(request)
    if secret is not None and is_secret(secret):
        if active is not None and hmac.compare_digest(hash_secret(secret), active):
            return kiosk_id
        _record_bad_secret(request, kiosk_id)

    parsed = read_kiosk_cookie(request.cookies.get(KIOSK_COOKIE))
    if parsed is None:
        return None
    cookie_id, cookie_fingerprint, issued = parsed
    if cookie_id != kiosk_id or active is None:
        return None
    if not hmac.compare_digest(cookie_fingerprint, fingerprint(active)):
        return None
    _renew_if_due(request, kiosk_id, active, issued)
    return kiosk_id


async def require_screen_itself(request: Request, kiosk_id: str) -> None:
    """Refuse a gated screen's agent-only write unless the caller is that screen.

    An ungated screen behaves as it does today (peer checks and run ids still
    apply in the handlers). A gated one accepts only its own secret or cookie:
    no anonymous caller, no other screen, and no admin (calvin-0xns, design §3).
    """
    if await kiosk_principal(request) == kiosk_id:
        return
    from app.services.kiosk_view import is_gated, pairing_mode

    paired = await get_credential_hash(kiosk_id) is not None
    if not is_gated(paired, await pairing_mode()):
        return
    raise HTTPException(
        status_code=401,
        detail={"code": "kiosk_unpaired", "message": "This screen isn't paired."},
    )


async def kiosk_cookie_id(request: Request) -> str | None:
    """The kiosk id a valid ``calvin_kiosk`` cookie names, if any.

    The kiosk list has no kiosk id in its path, so only the cookie can unlock a
    row there; a bearer never does (the agent never reads the list).
    """
    parsed = read_kiosk_cookie(request.cookies.get(KIOSK_COOKIE))
    if parsed is None:
        return None
    kiosk_id, cookie_fingerprint, _issued = parsed
    active = await get_credential_hash(kiosk_id)
    if active is None:
        return None
    if not hmac.compare_digest(cookie_fingerprint, fingerprint(active)):
        return None
    return kiosk_id


async def kiosk_holder(request: Request) -> tuple[str, str] | None:
    """``(kiosk_id, secret_hash)`` for an active **or** pending secret.

    Used only where a pairing in progress may act (``GET …/pair`` and
    ``POST …/browser-session``); a cookie is valid while it matches either.
    """
    kiosk_id = _path_kiosk_id(request)
    if kiosk_id is None:
        return None

    secret = bearer_secret(request)
    if secret is not None and is_secret(secret):
        secret_hash = hash_secret(secret)
        active = await get_credential_hash(kiosk_id)
        if active is not None and hmac.compare_digest(secret_hash, active):
            return (kiosk_id, active)
        pending = pairing_store.pending_for(kiosk_id, secret_hash)
        if pending is not None:
            return (kiosk_id, pending.secret_hash)

    parsed = read_kiosk_cookie(request.cookies.get(KIOSK_COOKIE))
    if parsed is None:
        return None
    cookie_id, cookie_fingerprint, issued = parsed
    if cookie_id != kiosk_id:
        return None
    active = await get_credential_hash(kiosk_id)
    if active is not None and hmac.compare_digest(cookie_fingerprint, fingerprint(active)):
        _renew_if_due(request, kiosk_id, active, issued)
        return (kiosk_id, active)
    for pending in pairing_store.live():
        if pending.kiosk_id != kiosk_id:
            continue
        if hmac.compare_digest(cookie_fingerprint, fingerprint(pending.secret_hash)):
            return (kiosk_id, pending.secret_hash)
    return None
