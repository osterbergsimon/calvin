"""Calvin's MCP tools (CLV-33).

Each tool calls the service layer (or the route function that wraps it) in-process,
never HTTP-to-self, so validation and ``retry_on_db_locked`` behave exactly as for
the HTTP API. Every tool declares the API key scope it needs with ``@scoped``; the
check runs before any work. Results are compact JSON strings.

Service modules are imported inside the tools, like the routes do, so they always
resolve to the live module objects.
"""

import base64
import binascii
import functools
import json
import uuid
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from typing import Any, Literal
from urllib.parse import unquote, urlparse

import httpx
from fastapi import HTTPException
from loguru import logger
from mcp.server.fastmcp import Context, FastMCP
from mcp.server.fastmcp.exceptions import ToolError

from app.security.api_keys import SCOPE_RANK

__all__ = ["TOOL_SCOPES", "ToolError", "register_tools"]

TOOL_SCOPES: dict[str, str] = {}

MAX_EVENT_SPAN = timedelta(days=93)
MAX_EVENTS = 200
MAX_PHOTOS = 200
URL_FETCH_TIMEOUT = 15.0
CALENDAR_TYPES = ("ical", "google", "proton")
OSK_MODES = ("auto", "on", "off")
ORIENTATIONS = ("landscape", "portrait")
_OVERRIDE_KEYS = {  # tool argument -> kiosk override (config) key
    "orientation": "orientation",
    "page": "defaultScreenId",
    "osk_mode": "onScreenKeyboard",
}


def _json_default(value: Any) -> str:
    return value.isoformat() if isinstance(value, datetime) else str(value)


def _dump(data: Any) -> str:
    return json.dumps(data, separators=(",", ":"), default=_json_default)


def _http_message(exc: HTTPException) -> str:
    detail = exc.detail
    if isinstance(detail, dict):
        return str(detail.get("message") or detail.get("code") or detail)
    return str(detail)


def _request_key(ctx: Context | Any) -> dict | None:
    request = getattr(getattr(ctx, "request_context", None), "request", None)
    return getattr(getattr(request, "state", None), "api_key", None)


def scoped(scope: str) -> Callable[[Callable[..., Awaitable[str]]], Callable[..., Awaitable[str]]]:
    """Require an API key of at least ``scope`` before the tool runs.

    HTTP errors from the service layer become clear tool errors.
    """

    def decorator(func: Callable[..., Awaitable[str]]) -> Callable[..., Awaitable[str]]:
        TOOL_SCOPES[func.__name__] = scope

        @functools.wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> str:
            key = _request_key(kwargs.get("ctx"))
            if key is None:
                raise ToolError("This request has no valid API key.")
            if SCOPE_RANK[key["scope"]] < SCOPE_RANK[scope]:
                raise ToolError(
                    f"This API key can't do that. {func.__name__} needs the {scope} scope "
                    f"(this key has {key['scope']})."
                )
            try:
                return await func(*args, **kwargs)
            except HTTPException as exc:
                raise ToolError(_http_message(exc)) from exc

        return wrapper

    return decorator


def _parse_when(value: str, field: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as exc:
        raise ToolError(f"{field} must be an ISO date or datetime, e.g. 2026-11-02") from exc
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


async def _dashboard_screens() -> dict:
    from app.api.routes.config import build_global_config

    return (await build_global_config()).get("dashboardScreens") or {}


# -- read ---------------------------------------------------------------------


@scoped("read")
async def get_status(ctx: Context) -> str:
    """Health, versions and deployment (native/docker, whether host control is on)."""
    from app.api.routes.config import get_frontend_version, get_git_version
    from app.api.routes.health import _database_is_reachable
    from app.api.routes.system import get_environment

    env = await get_environment()
    database_ok = await _database_is_reachable()
    return _dump(
        {
            "status": "healthy" if database_ok else "unhealthy",
            "database": "ok" if database_ok else "error",
            "version": get_git_version(),
            "frontendVersion": get_frontend_version(),
            "deployment": env["deployment"],
            "hostControl": env["host_control"],
            "capabilities": env["capabilities"],
        }
    )


@scoped("read")
async def list_calendar_sources(ctx: Context) -> str:
    """Calendar sources (id, name, type, enabled, running). Feed URLs are never returned."""
    from app.api.routes.calendar import get_calendar_sources

    response = await get_calendar_sources()
    return _dump(
        [
            {
                "id": s.id,
                "name": s.name,
                "type": s.type,
                "enabled": s.enabled,
                "running": s.running,
                "color": s.color,
            }
            for s in response.sources
        ]
    )


@scoped("read")
async def list_events(
    ctx: Context, start: str | None = None, end: str | None = None, source_ids: str | None = None
) -> str:
    """Calendar events between two ISO dates (default: next 7 days, max 93 days).

    source_ids: optional comma-separated calendar source ids.
    """
    from app.services import plugin_calendar_service

    begin = _parse_when(start, "start") if start else datetime.now(UTC)
    finish = _parse_when(end, "end") if end else begin + timedelta(days=7)
    if finish <= begin:
        raise ToolError("end must be after start")
    if finish - begin > MAX_EVENT_SPAN:
        raise ToolError("The range is limited to 93 days")
    ids = [s.strip() for s in source_ids.split(",") if s.strip()] if source_ids else None
    events = await plugin_calendar_service.get_events(begin, finish, ids)
    return _dump(
        {
            "total": len(events),
            "truncated": len(events) > MAX_EVENTS,
            "events": [
                {
                    "id": e.id,
                    "title": e.title,
                    "start": e.start,
                    "end": e.end,
                    "allDay": e.all_day,
                    "source": e.source,
                    "location": e.location,
                }
                for e in events[:MAX_EVENTS]
            ],
        }
    )


@scoped("read")
async def list_photos(ctx: Context, limit: int = 50) -> str:
    """Photos shown on the dashboard: total count and the first `limit` (max 200)."""
    from app.services import plugin_image_service

    images = await plugin_image_service.get_images()
    keep = ("id", "name", "filename", "source", "source_id", "width", "height")
    return _dump(
        {
            "total": len(images),
            "photos": [
                {k: image[k] for k in keep if k in image}
                for image in images[: max(1, min(limit, MAX_PHOTOS))]
            ],
        }
    )


@scoped("read")
async def list_pages(ctx: Context) -> str:
    """Dashboard pages (layouts): id, name and the kind of each region."""
    screens = await _dashboard_screens()
    return _dump(
        {
            "activePageId": screens.get("activeScreenId"),
            "pages": [
                {
                    "id": s.get("id"),
                    "name": s.get("name"),
                    "regions": [
                        {"kind": r.get("kind"), "serviceId": r.get("serviceId")}
                        for r in (s.get("layout") or {}).get("regions", [])
                    ],
                }
                for s in screens.get("screens", [])
            ],
        }
    )


@scoped("read")
async def list_kiosks(ctx: Context) -> str:
    """Known kiosks with last-seen, agent version and their per-kiosk overrides."""
    from app.services import kiosk_registry

    kiosks = await kiosk_registry.list_kiosks()
    for kiosk in kiosks:
        overrides = await kiosk_registry.get_overrides(kiosk["id"]) or {}
        kiosk["overrides"] = {k: v for k, v in overrides.items() if not k.startswith("_")}
    return _dump(kiosks)


@scoped("read")
async def list_plugins(ctx: Context) -> str:
    """Installed plugin types: id, name, type (calendar/image/service/...), enabled."""
    from app.api.routes.plugins.management import get_plugins

    response = await get_plugins(plugin_type=None)
    return _dump(
        [
            {
                k: p.get(k)
                for k in ("id", "name", "type", "enabled", "description", "error_message")
                if p.get(k) not in (None, "")
            }
            for p in response["plugins"]
        ]
    )


# -- admin --------------------------------------------------------------------


@scoped("admin")
async def add_calendar_source(
    ctx: Context,
    name: str,
    ical_url: str,
    type: Literal["ical", "google", "proton"] = "ical",
    color: str | None = None,
) -> str:
    """Add a calendar from an iCal feed URL. The URL is checked before it is saved."""
    from app.api.routes.calendar import add_calendar_source as add_source
    from app.models.calendar import CalendarSource

    source = CalendarSource(
        id=f"{type}-{uuid.uuid4().hex[:8]}", type=type, name=name, ical_url=ical_url, color=color
    )
    await add_source(source)
    return _dump({"added": {"id": source.id, "name": name, "type": type}})


@scoped("admin")
async def remove_calendar_source(ctx: Context, source_id: str) -> str:
    """Remove a calendar source by id (see list_calendar_sources)."""
    from app.api.routes.calendar import remove_calendar_source as remove_source

    return _dump(await remove_source(source_id))


@scoped("admin")
async def refresh_calendars(ctx: Context) -> str:
    """Clear the calendar cache and re-fetch the current and adjacent months."""
    from app.api.routes.calendar import refresh_calendar_cache

    return _dump(await refresh_calendar_cache(month=None, year=None))


async def _fetch_photo(url: str) -> tuple[bytes, str]:
    """Download ``url`` (http/https) up to the upload size limit."""
    from app.api.routes.images import MAX_UPLOAD_BYTES

    if urlparse(url).scheme not in ("http", "https"):
        raise ToolError("url must be http or https")
    data = bytearray()
    try:
        async with httpx.AsyncClient(timeout=URL_FETCH_TIMEOUT, follow_redirects=True) as client:
            async with client.stream("GET", url) as response:
                response.raise_for_status()
                async for chunk in response.aiter_bytes():
                    data.extend(chunk)
                    if len(data) > MAX_UPLOAD_BYTES:
                        raise ToolError(
                            f"File too large. Maximum size is {MAX_UPLOAD_BYTES // (1024 * 1024)}MB"
                        )
    except httpx.HTTPError as exc:
        raise ToolError(f"Could not download the photo: {type(exc).__name__}") from exc
    return bytes(data), unquote(urlparse(url).path.rsplit("/", 1)[-1])


@scoped("admin")
async def upload_photo(
    ctx: Context,
    filename: str | None = None,
    data_base64: str | None = None,
    url: str | None = None,
) -> str:
    """Add a photo from base64 data or an http(s) URL (jpg, png, webp, gif; max 10MB).

    Give exactly one of data_base64 (with filename) or url (filename optional).
    """
    from app.api.routes.images import MAX_UPLOAD_BYTES, validate_upload
    from app.services import plugin_image_service

    if (data_base64 is None) == (url is None):
        raise ToolError("Give exactly one of data_base64 or url")
    if data_base64 is not None:
        if not filename:
            raise ToolError("filename is required with data_base64")
        if len(data_base64) > MAX_UPLOAD_BYTES * 4 // 3 + 8:
            validate_upload(filename, MAX_UPLOAD_BYTES + 1)
        try:
            content = base64.b64decode(data_base64, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise ToolError("data_base64 is not valid base64") from exc
    else:
        assert url is not None
        content, url_name = await _fetch_photo(url)
        filename = filename or url_name
    validate_upload(filename or "", len(content))
    uploaded = await plugin_image_service.upload_image(content, filename or "")
    if not uploaded:
        raise ToolError("Failed to upload image: No plugin supports upload")
    return _dump({"uploaded": uploaded})


@scoped("admin")
async def set_kiosk_override(
    ctx: Context,
    kiosk_id: str,
    orientation: Literal["landscape", "portrait"] | None = None,
    page: str | None = None,
    osk_mode: Literal["auto", "on", "off"] | None = None,
    clear: list[Literal["orientation", "page", "osk_mode"]] | None = None,
) -> str:
    """Change one kiosk's settings: orientation, boot page id, on-screen keyboard mode.

    Only the arguments you give change; `clear` removes overrides so the kiosk follows
    the global setting again. The kiosk must already be known (see list_kiosks).
    """
    from pydantic import ValidationError

    from app.api.routes.config import ConfigUpdate
    from app.services import kiosk_registry

    if not kiosk_registry._KIOSK_ID_RE.fullmatch(kiosk_id):
        raise ToolError("Invalid kiosk id")
    current = await kiosk_registry.get_overrides(kiosk_id)
    if current is None:
        raise ToolError(f"Unknown kiosk: {kiosk_id}")
    changes = {"orientation": orientation, "page": page, "osk_mode": osk_mode}
    if not any(v is not None for v in changes.values()) and not clear:
        raise ToolError("Nothing to change: give orientation, page, osk_mode or clear")
    if page is not None:
        screens = await _dashboard_screens()
        known = [s.get("id") for s in screens.get("screens", [])]
        if page not in known:
            raise ToolError(f"Unknown page {page!r}. Pages: {', '.join(map(str, known))}")
    merged = dict(current)
    for cleared in clear or []:
        merged.pop(_OVERRIDE_KEYS[cleared], None)
    for arg, value in changes.items():
        if value is not None:
            merged[_OVERRIDE_KEYS[arg]] = value
    try:
        ConfigUpdate(**merged)
    except ValidationError as exc:
        raise ToolError("Invalid overrides") from exc
    await kiosk_registry.set_overrides(kiosk_id, merged)
    logger.info("MCP set overrides for kiosk {}", kiosk_id)
    return _dump(
        {"id": kiosk_id, "overrides": {k: v for k, v in merged.items() if not k.startswith("_")}}
    )


# -- host ---------------------------------------------------------------------


@scoped("host")
async def display_power(ctx: Context, state: Literal["on", "off"]) -> str:
    """Turn the kiosk's physical display on or off. Needs CALVIN_HOST_CONTROL."""
    from app.services.display_power_service import display_power_service
    from app.utils.host_control import require_host_control

    require_host_control(f"Turning the display {state}")
    if state == "on":
        await display_power_service.turn_display_on()
    else:
        await display_power_service.turn_display_off()
    return _dump({"display": state})


_TOOLS = (
    get_status,
    list_calendar_sources,
    list_events,
    list_photos,
    list_pages,
    list_kiosks,
    list_plugins,
    add_calendar_source,
    remove_calendar_source,
    upload_photo,
    set_kiosk_override,
    refresh_calendars,
    display_power,
)


def register_tools(server: FastMCP) -> None:
    for tool in _TOOLS:
        server.add_tool(tool, name=tool.__name__)
