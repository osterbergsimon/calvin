"""Default-deny admin policy for state-changing and secret-leaking routes (CLV-9).

Enforcement is by route template, not by handler: every unsafe method needs an
admin session unless its ``(method, path_format)`` is in :data:`PUBLIC_WRITES`,
so a newly added write route is protected without anyone remembering to.
"""

from fastapi import HTTPException, Request
from loguru import logger

from app.security.admin_auth import COOKIE_NAME, api_key_limiter, get_admin_store
from app.security.api_keys import SCOPE_RANK, get_api_key_store

UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})

# The "viewer writes" tier (design §3): dashboard interactions that must keep
# working on a touch kiosk with no setup at all.
PUBLIC_WRITES = frozenset(
    {
        ("POST", "/api/images/next"),
        ("POST", "/api/images/previous"),
        ("POST", "/api/calendar/refresh"),
        ("POST", "/api/plugins/{plugin_id}/fetch"),
        ("POST", "/api/system/display/power/on"),
        ("POST", "/api/system/display/power/off"),
        # Body keys are restricted to CONFIG_DISPLAY_KEYS in the route itself.
        ("POST", "/api/config"),
        ("POST", "/api/auth/setup"),
        ("POST", "/api/auth/login"),
        ("POST", "/api/auth/logout"),
    }
)

# GETs default to public, so the secret-leaking ones are named explicitly.
ADMIN_READS = frozenset(
    {
        "/api/backup/export",
        "/api/backup/files",
        "/api/backup/files/{name}",
        "/api/backup/schedule",
        "/api/config/git/branches",
        "/api/plugins/{plugin_id}/scan",
        "/api/plugins/local/suggest",
        "/api/system/update/stream",
    }
)

# Routes that act on the machine Calvin runs on (they also call
# ``require_host_control``). An API key needs the ``host`` scope for these; a
# test keeps this set in sync with the routes that call the guard.
HOST_ROUTES = frozenset(
    {
        ("POST", "/api/system/update"),
        ("POST", "/api/system/display/power/on"),
        ("POST", "/api/system/display/power/off"),
        ("POST", "/api/system/display/timeout/configure"),
        ("POST", "/api/system/reload-ui"),
        ("POST", "/api/system/restart-frontend"),
        ("POST", "/api/system/restart-backend"),
        ("POST", "/api/system/reboot"),
    }
)

# Config keys the dashboard itself writes (callers listed in the PR body).
# A request without admin is accepted only when every key is in this set.
CONFIG_DISPLAY_KEYS = frozenset(
    {
        "dashboardScreens",
        "displaySettingsMigrated",  # one-time CLV-49 display migration flag
        "regionsLocked",
        "showUI",
        "themeMode",
        "selectedTheme",
        "darkModeStart",
        "darkModeEnd",
        "lastSideViewMode",
    }
)


def bearer_secret(request: Request) -> str | None:
    """The secret from ``Authorization: Bearer ...``; any other scheme is ignored."""
    scheme, _, value = request.headers.get("authorization", "").partition(" ")
    if scheme.lower() != "bearer":
        return None
    return value.strip()


def request_api_key(request: Request) -> dict | None:
    """The API key this request authenticated with (set by the route policy)."""
    return getattr(request.state, "api_key", None)


def is_admin_session(request: Request) -> bool:
    """True when the request carries a valid admin session cookie (keys never count)."""
    if request_api_key(request) is not None:
        return False
    return get_admin_store().verify_cookie(request.cookies.get(COOKIE_NAME))


def is_admin(request: Request) -> bool:
    """True for an admin session, or for an API key of ``admin`` scope or above."""
    key = request_api_key(request)
    if key is not None:
        return SCOPE_RANK[key["scope"]] >= SCOPE_RANK["admin"]
    return get_admin_store().verify_cookie(request.cookies.get(COOKIE_NAME))


def admin_error(store_configured: bool) -> HTTPException:
    """401 ``setup_required`` when unconfigured, else 401 ``admin_required``."""
    if not store_configured:
        return HTTPException(
            status_code=401,
            detail={
                "code": "setup_required",
                "message": "Choose an admin password in Settings before making changes.",
            },
        )
    return HTTPException(
        status_code=401,
        detail={"code": "admin_required", "message": "Admin login required."},
    )


def _authenticate_bearer(request: Request) -> dict | None:
    """Resolve a bearer key; a bad one is 401 (or 429), never anonymous."""
    secret = bearer_secret(request)
    if secret is None:
        return None
    ip = request.client.host if request.client else "unknown"
    wait = api_key_limiter.check(ip)
    if wait:
        raise HTTPException(
            status_code=429,
            detail={
                "code": "rate_limited",
                "message": f"Too many attempts. Try again in {wait} seconds.",
                "retry_after": wait,
            },
            headers={"Retry-After": str(wait)},
        )
    key = get_api_key_store().authenticate(secret)
    if key is None:
        api_key_limiter.record_failure(ip)
        logger.warning("Invalid or revoked API key from {}", ip)
        raise HTTPException(
            status_code=401,
            detail={"code": "invalid_api_key", "message": "Invalid or revoked API key."},
        )
    return key


def _insufficient_scope(needed: str) -> HTTPException:
    return HTTPException(
        status_code=403,
        detail={
            "code": "insufficient_scope",
            "message": f"This API key can't do that. It needs the {needed} scope.",
        },
    )


async def enforce_route_policy(request: Request) -> None:
    """FastAPI app-level dependency implementing the three route tiers.

    A bearer key replaces the cookie entirely: when the header is present the
    cookie is ignored, so the weaker credential can't be topped up by the stronger.
    """
    route = request.scope.get("route")
    path = getattr(route, "path_format", None) or request.url.path
    method = request.method.upper()
    key = _authenticate_bearer(request)
    if key is not None:
        request.state.api_key = key
        rank = SCOPE_RANK[key["scope"]]
        route_id = (method, path)
        # A valid key never gets less than an anonymous caller: viewer writes
        # stay open to every scope (host-acting ones still hit
        # ``require_host_control`` in the handler).
        if route_id in PUBLIC_WRITES:
            pass
        elif route_id in HOST_ROUTES:
            if rank < SCOPE_RANK["host"]:
                raise _insufficient_scope("host")
        elif method in UNSAFE_METHODS:
            if rank < SCOPE_RANK["admin"]:
                raise _insufficient_scope("admin")
        elif method in ("GET", "HEAD") and path in ADMIN_READS:
            if rank < SCOPE_RANK["admin"]:
                raise _insufficient_scope("admin")
        return
    if method in UNSAFE_METHODS:
        if (method, path) in PUBLIC_WRITES:
            return
        if is_admin(request):
            return
        raise admin_error(get_admin_store().is_configured())
    if method in ("GET", "HEAD") and path in ADMIN_READS:
        if is_admin(request):
            return
        raise admin_error(get_admin_store().is_configured())
