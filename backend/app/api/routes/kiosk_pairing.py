"""Kiosk pairing routes: start, show the code, approve, unpair, install codes.

Split out of ``kiosks.py`` because that module already carries the registry,
config, screen-power and display-check routes (calvin-0xns). The API is the one
in the design's section 4 table.
"""

import hmac
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, HTTPException, Request, Response
from loguru import logger
from pydantic import BaseModel

from app.security.admin_auth import get_admin_store
from app.security.kiosk_auth import (
    issue_kiosk_cookie,
    kiosk_holder,
    renew_kiosk_cookie,
    set_kiosk_cookie,
)
from app.security.route_policy import admin_error, is_admin, is_admin_session, request_api_key
from app.services import kiosk_registry
from app.services.kiosk_pairing import (
    RateLimited,
    approve_limiter,
    format_code,
    hash_secret,
    is_install_code,
    is_secret,
    new_secret,
    pairing_store,
)
from app.services.kiosk_registry import _KIOSK_ID_RE, get_credential_hash, get_overrides
from app.utils.public_url import public_base_url
from app.utils.utc import as_utc, utcnow

router = APIRouter()


def _valid_id_or_400(kiosk_id: str) -> None:
    if not _KIOSK_ID_RE.fullmatch(kiosk_id):
        raise HTTPException(status_code=400, detail="Invalid kiosk id")


def _no_store(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store"


def _iso(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def _stamp(moment: datetime) -> str:
    return as_utc(moment).isoformat(timespec="seconds").replace("+00:00", "Z")


def _peer(request: Request) -> str:
    from app.security.route_policy import direct_peer_ip

    return direct_peer_ip(request) or "unknown"


def _setup_required() -> HTTPException:
    return HTTPException(
        status_code=409,
        detail={
            "code": "setup_required",
            "message": "Choose an admin password in Settings before pairing a screen.",
        },
    )


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


def _require_session(request: Request) -> None:
    """Approving and minting need someone signed in to Settings, not an admin key."""
    if is_admin_session(request):
        return
    if request_api_key(request) is not None:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "session_required",
                "message": "Sign in to Settings to do this.",
            },
        )
    raise admin_error(get_admin_store().is_configured())


def _require_admin(request: Request) -> None:
    if not is_admin(request):
        raise admin_error(get_admin_store().is_configured())


def _configured() -> bool:
    return get_admin_store().is_configured()


async def _has_agent(kiosk_id: str) -> bool:
    """An agent has ever polled, or one is waiting to be approved right now."""
    return await kiosk_registry.agent_seen(kiosk_id) or pairing_store.has_agent_pending(kiosk_id)


class PairBody(BaseModel):
    installCode: str | None = None  # noqa: N815 - wire name
    browser: bool = False
    # The hostname a pending pairing carries into the row it creates. Optional:
    # the design says it comes from the pair body, but the plan's agent does not
    # send one, so a screen's next config poll fills it in as it always has.
    hostname: str | None = None


class PairState(BaseModel):
    state: Literal["paired", "pending", "none"]
    code: str | None = None
    expiresAt: str | None = None  # noqa: N815 - wire name


class BrowserSession(BaseModel):
    state: Literal["paired", "pending"]


class ApproveBody(BaseModel):
    code: str


class ApprovedPairing(BaseModel):
    id: str
    displayName: str  # noqa: N815 - wire name
    pairedAt: str  # noqa: N815 - wire name
    replaced: bool


class Unpaired(BaseModel):
    id: str
    changed: bool


class PendingPairing(BaseModel):
    kioskId: str  # noqa: N815 - wire name
    hostname: str | None
    createdAt: str  # noqa: N815 - wire name
    byAgent: bool  # noqa: N815 - wire name


class PendingList(BaseModel):
    pending: list[PendingPairing]


class InstallCode(BaseModel):
    code: str
    expiresAt: str  # noqa: N815 - wire name
    command: str


def _pending_state(pending) -> PairState:
    return PairState(
        state="pending",
        code=format_code(pending.code),
        expiresAt=_iso(pending.expires),
    )


async def _pair_state(request: Request, kiosk_id: str) -> PairState:
    """What this caller may know: paired, its own pending code, or nothing."""
    holder = await kiosk_holder(request)
    if holder is None:
        return PairState(state="none")
    _, secret_hash = holder
    active = await get_credential_hash(kiosk_id)
    if active is not None and hmac.compare_digest(active, secret_hash):
        return PairState(state="paired")
    pending = pairing_store.pending_for(kiosk_id, secret_hash)
    if pending is not None:
        return _pending_state(pending)
    return PairState(state="none")


@router.post("/kiosks/{kiosk_id}/pair", response_model=PairState)
async def post_pair(
    kiosk_id: str, body: PairBody, request: Request, response: Response
) -> PairState:
    """Start or continue pairing for this screen.

    An agent sends its own secret as a bearer; a browser-only screen sends
    ``{"browser": true}`` and is handed a cookie for a fresh server-made secret.
    The answer carries a code only to the holder of that pending secret.
    """
    _no_store(response)
    _valid_id_or_400(kiosk_id)
    if not _configured():
        raise _setup_required()

    hostname = (body.hostname or "").strip()[:255] or None
    if body.browser:
        if await _has_agent(kiosk_id):
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "screen_has_agent",
                    "message": "This screen has an agent, so its agent does the pairing.",
                },
            )
        peer = _peer(request)
        pending = next(
            (
                entry
                for entry in pairing_store.live()
                if entry.kiosk_id == kiosk_id and not entry.by_agent and entry.peer == peer
            ),
            None,
        )
        if pending is None:
            browser_secret = new_secret()
            try:
                pending = pairing_store.start(
                    kiosk_id,
                    hash_secret(browser_secret),
                    peer,
                    hostname=hostname,
                    by_agent=False,
                )
            except RateLimited as exc:
                raise _rate_limited(exc.wait) from None
        try:
            set_kiosk_cookie(response, issue_kiosk_cookie(kiosk_id, pending.secret_hash))
        except RuntimeError:
            raise _setup_required() from None
        return PairState(state="pending")

    secret: str | None = None
    from app.security.route_policy import bearer_secret

    candidate = bearer_secret(request)
    if candidate is not None and is_secret(candidate):
        secret = candidate

    if body.installCode is not None:
        if (
            secret is None
            or not is_install_code(body.installCode)
            or not (pairing_store.use_install_code(body.installCode))
        ):
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "install_code_invalid",
                    "message": "This install code is not valid any more. Pair by code instead.",
                },
            )
        now = utcnow()
        await kiosk_registry.set_credential(
            kiosk_id,
            hash_secret(secret),
            hostname=hostname,
            now=now,
        )
        pairing_store.drop_kiosk(kiosk_id)
        logger.info(f"Screen {kiosk_id!r} paired with a one-time install code")
        return PairState(state="paired")

    if secret is not None:
        secret_hash = hash_secret(secret)
        active = await get_credential_hash(kiosk_id)
        if active is not None and hmac.compare_digest(active, secret_hash):
            return PairState(state="paired")
        pending = pairing_store.pending_for(kiosk_id, secret_hash)
        if pending is not None:
            return _pending_state(pending)
        try:
            pending = pairing_store.start(
                kiosk_id,
                secret_hash,
                _peer(request),
                hostname=hostname,
                by_agent=True,
            )
        except RateLimited as exc:
            raise _rate_limited(exc.wait) from None
        return _pending_state(pending)

    return PairState(state="none")


@router.get("/kiosks/{kiosk_id}/pair", response_model=PairState)
async def get_pair(kiosk_id: str, request: Request, response: Response) -> PairState:
    """The caller's own pairing state; the code only to its pending holder."""
    _no_store(response)
    _valid_id_or_400(kiosk_id)
    state = await _pair_state(request, kiosk_id)
    renew_kiosk_cookie(request, response)
    return state


@router.post("/kiosks/{kiosk_id}/browser-session", response_model=BrowserSession)
async def post_browser_session(
    kiosk_id: str, request: Request, response: Response
) -> BrowserSession:
    """Swap a screen's bearer secret for the HttpOnly ``calvin_kiosk`` cookie."""
    _no_store(response)
    _valid_id_or_400(kiosk_id)
    if not _configured():
        raise _setup_required()
    holder = await kiosk_holder(request)
    if holder is None:
        raise HTTPException(
            status_code=401,
            detail={"code": "kiosk_unpaired", "message": "This screen isn't paired."},
        )
    _, secret_hash = holder
    active = await get_credential_hash(kiosk_id)
    try:
        set_kiosk_cookie(response, issue_kiosk_cookie(kiosk_id, secret_hash))
    except RuntimeError:
        raise _setup_required() from None
    if active is not None and hmac.compare_digest(active, secret_hash):
        return BrowserSession(state="paired")
    return BrowserSession(state="pending")


@router.get("/kiosks/pairings", response_model=PendingList)
async def get_pairings(request: Request, response: Response) -> PendingList:
    """Live pending pairings, with no code and no hash (Settings' waiting list)."""
    _no_store(response)
    _require_admin(request)
    entries = sorted(pairing_store.live(), key=lambda entry: entry.created)
    return PendingList(
        pending=[
            PendingPairing(
                kioskId=entry.kiosk_id,
                hostname=entry.hostname,
                createdAt=_iso(entry.created),
                byAgent=entry.by_agent,
            )
            for entry in entries
        ]
    )


@router.post("/kiosks/pairings", response_model=ApprovedPairing)
async def approve_pairing(
    body: ApproveBody, request: Request, response: Response
) -> ApprovedPairing:
    """Approve the code a screen shows: store its secret's hash and pair it."""
    _no_store(response)
    _require_session(request)
    ip = request.client.host if request.client else "unknown"
    wait = approve_limiter.check(ip)
    if wait:
        raise _rate_limited(wait)

    pending = pairing_store.take_by_code(body.code)
    if pending is None:
        approve_limiter.record_failure(ip)
        raise HTTPException(
            status_code=404,
            detail={
                "code": "pairing_code_invalid",
                "message": "That code didn't match. Check the code on the screen.",
            },
        )
    approve_limiter.record_success(ip)

    existing = await get_credential_hash(pending.kiosk_id)
    now = utcnow()
    await kiosk_registry.set_credential(
        pending.kiosk_id, pending.secret_hash, hostname=pending.hostname, now=now
    )
    overrides = await get_overrides(pending.kiosk_id) or {}
    name = overrides.get("displayName")
    display_name = (
        name.strip()
        if isinstance(name, str) and name.strip()
        else (pending.hostname or pending.kiosk_id)
    )
    logger.info(f"Screen {pending.kiosk_id!r} paired by an admin session")
    return ApprovedPairing(
        id=pending.kiosk_id,
        displayName=display_name,
        pairedAt=_stamp(now),
        replaced=existing is not None,
    )


@router.delete("/kiosks/{kiosk_id}/pairing", response_model=Unpaired)
async def delete_pairing(kiosk_id: str, request: Request, response: Response) -> Unpaired:
    """Unpair a screen: clear its hash, so its secret stops working at once."""
    _no_store(response)
    _valid_id_or_400(kiosk_id)
    _require_admin(request)
    changed = await kiosk_registry.clear_credential(kiosk_id)
    if changed is None:
        raise HTTPException(status_code=404, detail="Unknown kiosk")
    logger.info(f"Screen {kiosk_id!r} unpaired")
    return Unpaired(id=kiosk_id, changed=bool(changed))


@router.post("/kiosks/install-codes", response_model=InstallCode)
async def mint_install_code(request: Request, response: Response) -> InstallCode:
    """A one-time code for the install command; it works once, for 30 minutes."""
    _no_store(response)
    _require_session(request)
    code, expires = pairing_store.mint_install_code()
    base = public_base_url(request)
    return InstallCode(
        code=code,
        expiresAt=_iso(expires),
        command=f"curl -fsSL '{base}/api/kiosks/install.sh?pair={code}' | sudo bash",
    )
