"""Each MCP tool against fakes of the service layer (CLV-33)."""

import base64
import json
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from fastapi import HTTPException

from app.config import settings
from app.mcp_server import tools
from app.models.calendar import CalendarEvent, CalendarSource, CalendarSourcesResponse

from .conftest import fake_ctx

ADMIN = fake_ctx("admin")
READ = fake_ctx("read")
HOST = fake_ctx("host")


def run_json(coro_result: str):
    return json.loads(coro_result)


# -- read ---------------------------------------------------------------------


async def test_get_status(monkeypatch):
    monkeypatch.setattr("app.version.get_version", lambda: "0.1.0")
    monkeypatch.setattr("app.version.get_revision", lambda: "abc123")
    monkeypatch.setattr("app.api.routes.config.get_frontend_version", lambda: "fe1")
    monkeypatch.setattr(
        "app.api.routes.health._database_is_reachable", AsyncMock(return_value=True)
    )
    monkeypatch.setattr(
        "app.api.routes.system.get_environment",
        AsyncMock(
            return_value={
                "deployment": "native",
                "host_control": True,
                "capabilities": {"update": False, "restart": True, "reboot": True},
            }
        ),
    )
    data = run_json(await tools.get_status(ctx=READ))
    assert data == {
        "status": "healthy",
        "database": "ok",
        "version": "0.1.0",
        "revision": "abc123",
        "frontendVersion": "fe1",
        "deployment": "native",
        "hostControl": True,
        "capabilities": {"update": False, "restart": True, "reboot": True},
    }


async def test_get_status_reports_unhealthy_database(monkeypatch):
    monkeypatch.setattr("app.version.get_revision", lambda: None)
    monkeypatch.setattr("app.api.routes.config.get_frontend_version", lambda: None)
    monkeypatch.setattr(
        "app.api.routes.health._database_is_reachable", AsyncMock(return_value=False)
    )
    monkeypatch.setattr(
        "app.api.routes.system.get_environment",
        AsyncMock(return_value={"deployment": "docker", "host_control": False, "capabilities": {}}),
    )
    data = run_json(await tools.get_status(ctx=READ))
    assert data["status"] == "unhealthy"
    assert data["database"] == "error"


async def test_list_calendar_sources_never_returns_feed_urls(monkeypatch):
    source = CalendarSource(
        id="ical-1",
        type="ical",
        name="Family",
        ical_url="https://secret.test/feed.ics?token=abc",
        color="#fff",
    )
    monkeypatch.setattr(
        "app.api.routes.calendar.get_calendar_sources",
        AsyncMock(return_value=CalendarSourcesResponse(sources=[source], total=1)),
    )
    text = await tools.list_calendar_sources(ctx=READ)
    assert "secret.test" not in text
    assert run_json(text) == [
        {
            "id": "ical-1",
            "name": "Family",
            "type": "ical",
            "enabled": True,
            "running": False,
            "color": "#fff",
        }
    ]


def _event(n: int) -> CalendarEvent:
    return CalendarEvent(
        id=f"e{n}",
        title=f"Event {n}",
        start=datetime(2026, 11, 2, 9, tzinfo=UTC),
        end=datetime(2026, 11, 2, 10, tzinfo=UTC),
        source="s1",
    )


async def test_list_events_passes_the_range_and_sources(monkeypatch):
    get_events = AsyncMock(return_value=[_event(1)])
    monkeypatch.setattr("app.services.plugin_calendar_service.get_events", get_events)
    data = run_json(
        await tools.list_events(ctx=READ, start="2026-11-01", end="2026-11-08", source_ids="s1, s2")
    )
    begin, finish, ids = get_events.await_args.args
    assert begin == datetime(2026, 11, 1, tzinfo=UTC)
    assert finish == datetime(2026, 11, 8, tzinfo=UTC)
    assert ids == ["s1", "s2"]
    assert data["total"] == 1
    assert data["events"][0]["title"] == "Event 1"
    assert data["events"][0]["start"].startswith("2026-11-02T09:00")


async def test_list_events_truncates_and_says_so(monkeypatch):
    many = [_event(n) for n in range(250)]
    monkeypatch.setattr(
        "app.services.plugin_calendar_service.get_events", AsyncMock(return_value=many)
    )
    data = run_json(await tools.list_events(ctx=READ, start="2026-11-01", end="2026-11-08"))
    assert data["total"] == 250
    assert data["truncated"] is True
    assert len(data["events"]) == tools.MAX_EVENTS


@pytest.mark.parametrize(
    ("start", "end", "message"),
    [
        ("nope", None, "ISO"),
        ("2026-11-08", "2026-11-01", "after start"),
        ("2026-01-01", "2026-12-31", "93 days"),
    ],
)
async def test_list_events_validates_the_range(start, end, message):
    with pytest.raises(tools.ToolError, match=message):
        await tools.list_events(ctx=READ, start=start, end=end)


async def test_list_photos_limits_and_trims(monkeypatch):
    images = [{"id": str(n), "filename": f"{n}.jpg", "path": "/secret/path"} for n in range(5)]
    monkeypatch.setattr(
        "app.services.plugin_image_service.get_images", AsyncMock(return_value=images)
    )
    data = run_json(await tools.list_photos(ctx=READ, limit=2))
    assert data["total"] == 5
    assert data["photos"] == [
        {"id": "0", "filename": "0.jpg"},
        {"id": "1", "filename": "1.jpg"},
    ]


async def test_list_kiosks_includes_overrides_but_not_internal_flags(monkeypatch):
    monkeypatch.setattr(
        "app.services.kiosk_registry.list_kiosks",
        AsyncMock(return_value=[{"id": "kitchen", "hostname": "pi"}]),
    )
    monkeypatch.setattr(
        "app.services.kiosk_registry.get_overrides",
        AsyncMock(return_value={"orientation": "portrait", "_agentUpdateRequested": True}),
    )
    data = run_json(await tools.list_kiosks(ctx=READ))
    assert data == [{"id": "kitchen", "hostname": "pi", "overrides": {"orientation": "portrait"}}]


async def test_list_plugins_is_compact(monkeypatch):
    monkeypatch.setattr(
        "app.api.routes.plugins.management.get_plugins",
        AsyncMock(
            return_value={
                "plugins": [
                    {
                        "id": "ical",
                        "name": "iCal",
                        "type": "calendar",
                        "enabled": True,
                        "description": "",
                        "config_schema": {"big": "blob"},
                    }
                ],
                "total": 1,
            }
        ),
    )
    assert run_json(await tools.list_plugins(ctx=READ)) == [
        {"id": "ical", "name": "iCal", "type": "calendar", "enabled": True}
    ]


# -- admin: calendars -----------------------------------------------------------


async def test_add_calendar_source_goes_through_the_route_validation(monkeypatch):
    add = AsyncMock()
    monkeypatch.setattr("app.api.routes.calendar.add_calendar_source", add)
    data = run_json(
        await tools.add_calendar_source(
            ctx=ADMIN, name="Work", ical_url="https://x.test/a.ics", color="#123456"
        )
    )
    source = add.await_args.args[0]
    assert source.name == "Work"
    assert source.type == "ical"
    assert source.ical_url == "https://x.test/a.ics"
    assert source.id.startswith("ical-")
    assert data["added"]["id"] == source.id


async def test_add_calendar_source_surfaces_validation_errors(monkeypatch):
    monkeypatch.setattr(
        "app.api.routes.calendar.add_calendar_source",
        AsyncMock(side_effect=HTTPException(status_code=400, detail="Calendar URL is required")),
    )
    with pytest.raises(tools.ToolError, match="Calendar URL is required"):
        await tools.add_calendar_source(ctx=ADMIN, name="Work", ical_url=" ")


async def test_remove_calendar_source(monkeypatch):
    remove = AsyncMock(return_value={"message": "Calendar source removed", "source_id": "s1"})
    monkeypatch.setattr("app.api.routes.calendar.remove_calendar_source", remove)
    data = run_json(await tools.remove_calendar_source(ctx=ADMIN, source_id="s1"))
    remove.assert_awaited_once_with("s1")
    assert data["source_id"] == "s1"


async def test_remove_unknown_calendar_source_is_a_tool_error(monkeypatch):
    monkeypatch.setattr(
        "app.api.routes.calendar.remove_calendar_source",
        AsyncMock(side_effect=HTTPException(status_code=404, detail="Calendar source not found")),
    )
    with pytest.raises(tools.ToolError, match="not found"):
        await tools.remove_calendar_source(ctx=ADMIN, source_id="nope")


async def test_refresh_calendars(monkeypatch):
    refresh = AsyncMock(return_value={"message": "Calendar cache refreshed for all cached months"})
    monkeypatch.setattr("app.api.routes.calendar.refresh_calendar_cache", refresh)
    data = run_json(await tools.refresh_calendars(ctx=ADMIN))
    refresh.assert_awaited_once_with(month=None, year=None)
    assert "refreshed" in data["message"]


# -- admin: photos --------------------------------------------------------------


@pytest.fixture
def uploader(monkeypatch):
    upload = AsyncMock(return_value={"id": "img1", "filename": "a.png"})
    monkeypatch.setattr("app.services.plugin_image_service.upload_image", upload)
    return upload


async def test_upload_photo_from_base64(uploader):
    data = run_json(
        await tools.upload_photo(
            ctx=ADMIN, filename="a.png", data_base64=base64.b64encode(b"PNGDATA").decode()
        )
    )
    uploader.assert_awaited_once_with(b"PNGDATA", "a.png")
    assert data["uploaded"]["id"] == "img1"


@pytest.mark.parametrize(
    ("kwargs", "message"),
    [
        ({"filename": "a.exe", "data_base64": "AAAA"}, "Unsupported file format"),
        ({"filename": "a.png", "data_base64": "!!notbase64"}, "valid base64"),
        ({"filename": "a.png"}, "exactly one"),
        (
            {"filename": "a.png", "data_base64": "AAAA", "url": "https://x.test/a.png"},
            "exactly one",
        ),
        ({"data_base64": "AAAA"}, "filename is required"),
        ({"url": "ftp://x.test/a.png"}, "http or https"),
    ],
)
async def test_upload_photo_rejects_bad_input(uploader, kwargs, message):
    with pytest.raises(tools.ToolError, match=message):
        await tools.upload_photo(ctx=ADMIN, **kwargs)
    uploader.assert_not_awaited()


async def test_upload_photo_enforces_the_size_limit(uploader, monkeypatch):
    monkeypatch.setattr("app.api.routes.images.MAX_UPLOAD_BYTES", 4)
    with pytest.raises(tools.ToolError, match="too large"):
        await tools.upload_photo(
            ctx=ADMIN, filename="a.png", data_base64=base64.b64encode(b"12345").decode()
        )
    uploader.assert_not_awaited()


def _patch_download(monkeypatch, handler):
    real = httpx.AsyncClient
    monkeypatch.setattr(
        tools.httpx,
        "AsyncClient",
        lambda **kw: real(transport=httpx.MockTransport(handler), **kw),
    )


async def test_upload_photo_from_url(uploader, monkeypatch):
    _patch_download(monkeypatch, lambda request: httpx.Response(200, content=b"IMG"))
    await tools.upload_photo(ctx=ADMIN, url="https://x.test/pics/my%20cat.jpg")
    uploader.assert_awaited_once_with(b"IMG", "my cat.jpg")


async def test_upload_photo_url_stops_at_the_size_limit(uploader, monkeypatch):
    monkeypatch.setattr("app.api.routes.images.MAX_UPLOAD_BYTES", 4)
    _patch_download(monkeypatch, lambda request: httpx.Response(200, content=b"123456789"))
    with pytest.raises(tools.ToolError, match="too large"):
        await tools.upload_photo(ctx=ADMIN, url="https://x.test/a.png")
    uploader.assert_not_awaited()


async def test_upload_photo_url_failure_is_a_tool_error(uploader, monkeypatch):
    _patch_download(monkeypatch, lambda request: httpx.Response(404))
    with pytest.raises(tools.ToolError, match="Could not download"):
        await tools.upload_photo(ctx=ADMIN, url="https://x.test/a.png")


async def test_upload_photo_when_no_plugin_accepts_uploads(monkeypatch):
    monkeypatch.setattr(
        "app.services.plugin_image_service.upload_image", AsyncMock(return_value=None)
    )
    with pytest.raises(tools.ToolError, match="No plugin supports upload"):
        await tools.upload_photo(ctx=ADMIN, filename="a.png", data_base64="AAAA")


# -- admin: kiosks --------------------------------------------------------------


@pytest.fixture
def kiosks(monkeypatch):
    stored: dict = {"orientation": "landscape", "_agentUpdateRequested": True}
    set_overrides = AsyncMock()
    monkeypatch.setattr(
        "app.services.kiosk_registry.get_overrides",
        AsyncMock(side_effect=lambda kid: stored if kid == "kitchen" else None),
    )
    monkeypatch.setattr("app.services.kiosk_registry.set_overrides", set_overrides)
    monkeypatch.setattr(
        tools,
        "_dashboard_screens",
        AsyncMock(return_value={"screens": [{"id": "screen-home"}, {"id": "screen-photos"}]}),
    )
    return set_overrides


async def test_set_kiosk_override_merges_and_keeps_internal_flags(kiosks):
    data = run_json(
        await tools.set_kiosk_override(
            ctx=ADMIN,
            kiosk_id="kitchen",
            orientation="portrait",
            page="screen-photos",
            osk_mode="on",
        )
    )
    saved = kiosks.await_args.args[1]
    assert saved == {
        "orientation": "portrait",
        "defaultScreenId": "screen-photos",
        "onScreenKeyboard": "on",
        "_agentUpdateRequested": True,
    }
    assert data["overrides"] == {
        "orientation": "portrait",
        "defaultScreenId": "screen-photos",
        "onScreenKeyboard": "on",
    }


async def test_set_kiosk_override_clear(kiosks):
    await tools.set_kiosk_override(ctx=ADMIN, kiosk_id="kitchen", clear=["orientation"])
    assert kiosks.await_args.args[1] == {"_agentUpdateRequested": True}


@pytest.mark.parametrize(
    ("kwargs", "message"),
    [
        ({"kiosk_id": "ghost", "orientation": "portrait"}, "Unknown kiosk"),
        ({"kiosk_id": "bad id!", "orientation": "portrait"}, "Invalid kiosk id"),
        ({"kiosk_id": "kitchen"}, "Nothing to change"),
        ({"kiosk_id": "kitchen", "page": "nope"}, "Unknown page"),
    ],
)
async def test_set_kiosk_override_rejects_bad_input(kiosks, kwargs, message):
    with pytest.raises(tools.ToolError, match=message):
        await tools.set_kiosk_override(ctx=ADMIN, **kwargs)
    kiosks.assert_not_awaited()


# -- host -----------------------------------------------------------------------


@pytest.fixture
def display(monkeypatch):
    """The display service with its subprocess calls mocked: nothing touches the screen."""
    run = MagicMock()
    monkeypatch.setattr("app.utils.platform.run_command", run)
    monkeypatch.setattr("subprocess.run", run)
    service = SimpleNamespace(turn_display_on=AsyncMock(), turn_display_off=AsyncMock())
    monkeypatch.setattr("app.services.display_power_service.display_power_service", service)
    return service, run


@pytest.mark.parametrize("state", ["on", "off"])
async def test_display_power_calls_the_service(display, monkeypatch, state):
    service, run = display
    monkeypatch.setattr(settings, "host_control", True)
    data = run_json(await tools.display_power(ctx=HOST, state=state))
    assert data == {"display": state}
    called = service.turn_display_on if state == "on" else service.turn_display_off
    other = service.turn_display_off if state == "on" else service.turn_display_on
    called.assert_awaited_once()
    other.assert_not_awaited()
    run.assert_not_called()


async def test_display_power_refused_when_host_control_is_off(display, monkeypatch):
    service, run = display
    monkeypatch.setattr(settings, "host_control", False)
    with pytest.raises(tools.ToolError, match="CALVIN_HOST_CONTROL"):
        await tools.display_power(ctx=HOST, state="off")
    service.turn_display_off.assert_not_awaited()
    run.assert_not_called()
