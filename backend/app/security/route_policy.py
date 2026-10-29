"""Default-deny admin policy for state-changing and secret-leaking routes (CLV-9).

Enforcement is by route template, not by handler: every unsafe method needs an
admin session unless its ``(method, path_format)`` is in :data:`PUBLIC_WRITES`,
so a newly added write route is protected without anyone remembering to.
"""

from fastapi import HTTPException, Request

from app.security.admin_auth import COOKIE_NAME, get_admin_store

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

# Config keys the dashboard itself writes (callers listed in the PR body).
# A request without admin is accepted only when every key is in this set.
CONFIG_DISPLAY_KEYS = frozenset(
    {
        "dashboardScreens",
        "regionsLocked",
        "showUI",
        "themeMode",
        "selectedTheme",
        "darkModeStart",
        "darkModeEnd",
        "lastSideViewMode",
    }
)


def is_admin(request: Request) -> bool:
    """True when the request carries a valid admin session cookie."""
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


async def enforce_route_policy(request: Request) -> None:
    """FastAPI app-level dependency implementing the three route tiers."""
    route = request.scope.get("route")
    path = getattr(route, "path_format", None) or request.url.path
    method = request.method.upper()
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
