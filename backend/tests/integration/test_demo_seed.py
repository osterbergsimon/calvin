"""Sample data seed/clear (CLV-67).

Every test runs against a temporary data dir and the shared test database —
never the owner's real data.
"""

from datetime import date
from pathlib import Path

import pytest
import pytest_asyncio
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.demo.ics import build_ics
from app.demo.seed import (
    CALENDAR_SOURCE_ID,
    DEFAULT_CALENDAR_VIEW,
    DEFAULT_PHOTOS_VIEW,
    DEFAULT_SCREEN_ID,
    DEFAULT_SCREEN_NAME,
    DEMO_ROOM_NAME,
    PHOTO_ASSETS_DIR,
    SCREEN_CALENDAR_ID,
    SCREEN_PHOTO_ID,
    calendar_ics_path,
    clear_demo,
    default_calendar_url,
    is_untouched_default_page,
    read_manifest,
    seed_demo,
)

pytestmark = pytest.mark.integration

CALENDAR_URL = default_calendar_url(8000)
TODAY = date(2026, 10, 31)

USER_PAGE = {
    "id": "user-screen",
    "name": "Kitchen",
    "layout": {
        "version": 1,
        "preset": "single",
        "regions": [{"id": "region-1", "kind": "calendar", "serviceId": None, "size": 100}],
    },
    "activeRegionId": "region-1",
}
USER_SCREENS = {"version": 2, "activeScreenId": "user-screen", "screens": [USER_PAGE]}


def shipped_default_screens() -> dict:
    """The raw default a backend writes on first start."""
    return {
        "version": 2,
        "activeScreenId": DEFAULT_SCREEN_ID,
        "screens": [
            {
                "id": DEFAULT_SCREEN_ID,
                "name": DEFAULT_SCREEN_NAME,
                "layout": {
                    "version": 1,
                    "preset": "split_two",
                    "regions": [
                        {"id": "region-1", "kind": "calendar", "size": 70},
                        {"id": "region-2", "kind": "photos", "size": 30},
                    ],
                },
                "activeRegionId": "region-1",
            }
        ],
    }


def normalized_default_screens() -> dict:
    """The same page after the frontend normalized it and CLV-49 migrated it."""
    return {
        "version": 2,
        "activeScreenId": DEFAULT_SCREEN_ID,
        "screens": [
            {
                "id": DEFAULT_SCREEN_ID,
                "name": DEFAULT_SCREEN_NAME,
                "layout": {
                    "version": 1,
                    "preset": "split_two",
                    "direction": None,
                    "regions": [
                        {
                            "id": "region-1",
                            "kind": "calendar",
                            "serviceId": None,
                            "instanceIds": [],
                            "size": 70,
                            "split": None,
                            "view": dict(DEFAULT_CALENDAR_VIEW),
                        },
                        {
                            "id": "region-2",
                            "kind": "photos",
                            "serviceId": None,
                            "instanceIds": [],
                            "size": 30,
                            "split": None,
                            "view": dict(DEFAULT_PHOTOS_VIEW),
                        },
                    ],
                },
                "activeRegionId": "region-1",
                "clockBar": None,
            }
        ],
    }


@pytest_asyncio.fixture(autouse=True)
async def _clean_plugin_manager():
    """Keep the singleton plugin manager from leaking instances between tests."""
    from app.plugins.manager import plugin_manager

    for plugin_id in list(plugin_manager._plugins):
        await plugin_manager.unregister(plugin_id)
    yield
    for plugin_id in list(plugin_manager._plugins):
        await plugin_manager.unregister(plugin_id)


@pytest_asyncio.fixture
async def demo_env(test_db, tmp_path):
    """A temp data dir with the plugin types a fresh install would have."""
    from app.plugins.loader import plugin_loader
    from app.plugins.registry.loader import load_plugin_types

    plugin_loader.load_all_plugins()
    await load_plugin_types()

    data_dir = tmp_path / "data"
    image_dir = data_dir / "images"
    image_dir.mkdir(parents=True)
    return data_dir, image_dir


async def _seed(data_dir: Path, image_dir: Path):
    return await seed_demo(
        data_dir=data_dir,
        image_dir=image_dir,
        calendar_url=CALENDAR_URL,
        today=TODAY,
    )


async def _demo_photo_names(image_dir: Path) -> list[str]:
    return sorted(path.name for path in image_dir.glob("calvin-demo-*.jpg"))


async def _user_calendar(plugin_id: str = "user-calendar") -> None:
    from app.plugins.registry import plugin_registry

    await plugin_registry.register_plugin(
        plugin_id=plugin_id,
        type_id="ical",
        name="My calendar",
        config={"ical_url": "https://example.com/me.ics"},
        enabled=False,
    )


async def test_seed_is_idempotent(demo_env):
    from app.models.db_models import PluginDB
    from app.services.config_service import config_service

    data_dir, image_dir = demo_env
    first = await _seed(data_dir, image_dir)
    second = await _seed(data_dir, image_dir)

    rows = await PluginDB.objects.filter(id=CALENDAR_SOURCE_ID).all()
    assert len(rows) == 1
    assert (rows[0].config or {}).get("demo") is True
    assert rows[0].config["ical_url"] == CALENDAR_URL

    photos = await _demo_photo_names(image_dir)
    assert len(photos) == 12
    assert first["photos"]["count"] == 12
    assert second["photos"]["count"] == 12

    manifest = read_manifest(data_dir)
    assert manifest is not None
    assert sorted(manifest["photos"]) == photos
    assert manifest["calendar_source_ids"] == [CALENDAR_SOURCE_ID]

    screens = await config_service.get_value("dashboard_screens")
    assert [screen["id"] for screen in screens["screens"]] == [
        SCREEN_CALENDAR_ID,
        SCREEN_PHOTO_ID,
    ]
    assert await config_service.get_value("displayName") == DEMO_ROOM_NAME
    assert calendar_ics_path(data_dir).is_file()


@pytest.mark.parametrize(
    "factory",
    [shipped_default_screens, normalized_default_screens],
    ids=["raw", "normalized"],
)
async def test_seed_replaces_the_untouched_default_page(demo_env, factory):
    from app.services.config_service import config_service

    data_dir, image_dir = demo_env
    await config_service.set_value("dashboard_screens", factory())

    seeded = await _seed(data_dir, image_dir)

    assert seeded["pages"]["created"] is True
    screens = await config_service.get_value("dashboard_screens")
    assert [screen["id"] for screen in screens["screens"]] == [
        SCREEN_CALENDAR_ID,
        SCREEN_PHOTO_ID,
    ]
    assert await config_service.get_value("displayName") == DEMO_ROOM_NAME

    await clear_demo(data_dir=data_dir, image_dir=image_dir)
    assert await config_service.get_value("dashboard_screens") is None
    assert await config_service.get_value("displayName") is None


async def test_seed_skips_pages_when_the_default_page_was_edited(demo_env):
    from app.services.config_service import config_service

    data_dir, image_dir = demo_env
    edited = shipped_default_screens()
    edited["screens"][0]["name"] = "Living room"
    await config_service.set_value("dashboard_screens", edited)

    seeded = await _seed(data_dir, image_dir)

    assert seeded["pages"]["created"] is False
    assert seeded["photos"]["count"] == 12
    assert await config_service.get_value("dashboard_screens") == edited
    assert await config_service.get_value("displayName") is None


async def test_backend_synthesized_default_is_recognized(demo_env):
    """Guard against the shipped default drifting away from the detection."""
    from app.api.routes.config import build_global_config

    config = await build_global_config()
    assert is_untouched_default_page(config["dashboardScreens"])


def test_untouched_default_page_is_recognized():
    assert is_untouched_default_page(shipped_default_screens())
    assert is_untouched_default_page(normalized_default_screens())
    assert is_untouched_default_page(None) is False
    assert is_untouched_default_page({"screens": []}) is False


@pytest.mark.parametrize(
    "edit",
    [
        lambda config: config["screens"][0].update(name="Living room"),
        lambda config: config["screens"][0].update(clockBar={"enabled": True}),
        lambda config: config["screens"][0]["layout"].update(preset="single"),
        lambda config: config["screens"][0]["layout"].update(direction="column"),
        lambda config: config["screens"][0]["layout"]["regions"][0].update(size=60),
        lambda config: config["screens"][0]["layout"]["regions"][0].update(
            instanceIds=["ical-12345678"]
        ),
        lambda config: config["screens"][0]["layout"]["regions"][0]["view"].update(mode="week"),
        lambda config: config["screens"][0]["layout"]["regions"][1]["view"].update(fit="fill"),
        lambda config: config["screens"].append(config["screens"][0]),
        lambda config: config.update(activeScreenId="somewhere-else"),
        lambda config: config["screens"][0].update(futureSetting=True),
        lambda config: config["screens"][0]["layout"].update(futureSetting=True),
        lambda config: config["screens"][0]["layout"]["regions"][0].update(futureSetting=True),
    ],
)
def test_user_edits_are_not_treated_as_the_default_page(edit):
    config = normalized_default_screens()
    edit(config)
    assert is_untouched_default_page(config) is False


async def test_clear_removes_only_demo_items(demo_env):
    from app.models.db_models import PluginDB
    from app.services.config_service import config_service

    data_dir, image_dir = demo_env
    await _user_calendar()
    user_photo = image_dir / "holiday.jpg"
    user_photo.write_bytes(b"user photo")
    lookalike = image_dir / "calvin-demo-99-user.jpg"
    lookalike.write_bytes(b"user file with a demo-like name")
    await config_service.set_value("dashboard_screens", USER_SCREENS)
    await config_service.set_value("displayName", "Kitchen")

    seeded = await _seed(data_dir, image_dir)
    # The user already has a page, so pages and the room name stay untouched.
    assert seeded["pages"]["created"] is False
    assert await config_service.get_value("dashboard_screens") == USER_SCREENS
    assert await config_service.get_value("displayName") == "Kitchen"

    result = await clear_demo(data_dir=data_dir, image_dir=image_dir)

    assert result["removed"] is True
    assert result["calendar"] is True
    assert len(result["photos"]) == 12
    assert await PluginDB.objects.get_or_none(id=CALENDAR_SOURCE_ID) is None
    assert await PluginDB.objects.get_or_none(id="user-calendar") is not None
    assert user_photo.read_bytes() == b"user photo"
    assert lookalike.read_bytes() == b"user file with a demo-like name"
    assert await _demo_photo_names(image_dir) == ["calvin-demo-99-user.jpg"]
    assert await config_service.get_value("dashboard_screens") == USER_SCREENS
    assert await config_service.get_value("displayName") == "Kitchen"
    assert not calendar_ics_path(data_dir).exists()


async def test_clear_undoes_pages_and_room_name_when_it_created_them(demo_env):
    from app.services.config_service import config_service

    data_dir, image_dir = demo_env
    seeded = await _seed(data_dir, image_dir)
    assert seeded["pages"]["created"] is True

    await clear_demo(data_dir=data_dir, image_dir=image_dir)

    # The keys are gone again, so Calvin's built-in defaults apply.
    assert await config_service.get_value("dashboard_screens") is None
    assert await config_service.get_value("displayName") is None
    assert not calendar_ics_path(data_dir).exists()
    assert read_manifest(data_dir) is None


async def test_clear_keeps_a_page_the_user_added_while_demo_pages_existed(demo_env):
    from app.services.config_service import config_service

    data_dir, image_dir = demo_env
    await _seed(data_dir, image_dir)

    screens = await config_service.get_value("dashboard_screens")
    screens["screens"].append(USER_PAGE)
    screens["activeScreenId"] = "user-screen"
    await config_service.set_value("dashboard_screens", screens)

    await clear_demo(data_dir=data_dir, image_dir=image_dir)

    remaining = await config_service.get_value("dashboard_screens")
    assert [screen["id"] for screen in remaining["screens"]] == ["user-screen"]
    assert remaining["activeScreenId"] == "user-screen"


async def test_clear_keeps_a_duplicated_demo_page(demo_env):
    """Duplicating a sample page copies its marker but not its id; it is the user's."""
    import copy

    from app.services.config_service import config_service

    data_dir, image_dir = demo_env
    await _seed(data_dir, image_dir)

    screens = await config_service.get_value("dashboard_screens")
    duplicate = copy.deepcopy(screens["screens"][0])
    duplicate["id"] = "screen-user-copy"
    screens["screens"].append(duplicate)
    screens["activeScreenId"] = duplicate["id"]
    await config_service.set_value("dashboard_screens", screens)

    # A second seed sees a user page and leaves the page list alone.
    await _seed(data_dir, image_dir)
    await clear_demo(data_dir=data_dir, image_dir=image_dir)

    remaining = await config_service.get_value("dashboard_screens")
    assert [screen["id"] for screen in remaining["screens"]] == ["screen-user-copy"]
    assert remaining["activeScreenId"] == "screen-user-copy"


async def test_clear_without_manifest_removes_nothing(demo_env):
    from app.models.db_models import PluginDB
    from app.services.config_service import config_service

    data_dir, image_dir = demo_env
    await _user_calendar()
    lookalike = image_dir / "calvin-demo-99-user.jpg"
    lookalike.write_bytes(b"user file with a demo-like name")
    await config_service.set_value("displayName", "Kitchen")

    result = await clear_demo(data_dir=data_dir, image_dir=image_dir)

    assert result["removed"] is False
    assert lookalike.is_file()
    assert await PluginDB.objects.get_or_none(id="user-calendar") is not None
    assert await config_service.get_value("displayName") == "Kitchen"


async def test_clear_is_a_noop_when_nothing_is_seeded(demo_env):
    data_dir, image_dir = demo_env
    result = await clear_demo(data_dir=data_dir, image_dir=image_dir)
    assert result == {"removed": False, "reason": "no demo data is seeded"}


def test_demo_route_serves_the_ics(tmp_path, monkeypatch):
    from app.api.routes import demo as demo_route
    from app.config import settings

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    app = FastAPI()
    app.include_router(demo_route.router, prefix="/api")

    with TestClient(app) as client:
        assert client.get("/api/demo/calendar.ics").status_code == 404

        path = calendar_ics_path(tmp_path)
        path.parent.mkdir(parents=True)
        path.write_text(build_ics(today=TODAY), encoding="utf-8")

        response = client.get("/api/demo/calendar.ics")
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/calendar")
        assert b"BEGIN:VCALENDAR" in response.content


def test_bundled_photos_are_small_and_valid():
    from PIL import Image

    photos = sorted(PHOTO_ASSETS_DIR.glob("calvin-demo-*.jpg"))
    assert len(photos) == 12
    assert sum(photo.stat().st_size for photo in photos) < 3 * 1024 * 1024
    for photo in photos:
        with Image.open(photo) as image:
            assert image.size == (800, 600)
            image.verify()


def test_demo_route_is_registered():
    from app.main import app

    assert any(getattr(route, "path", "") == "/api/demo/calendar.ics" for route in app.routes)


def test_build_ics_anchors_events_to_today():
    ics = build_ics(today=TODAY)
    assert f"DTSTART:{TODAY.strftime('%Y%m%d')}T100000Z" in ics
    assert f"UID:dentist-{TODAY.strftime('%Y%m%d')}@calvin.test" in ics
    assert ics.count("BEGIN:VEVENT") > 40
