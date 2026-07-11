"""Pytest configuration and shared fixtures."""

import asyncio
import logging
import tempfile
from collections.abc import AsyncGenerator, Generator
from pathlib import Path

import databases
import pytest
import pytest_asyncio
from fastapi.testclient import TestClient

# Import all models so Ormar registers their tables with metadata.
# This MUST happen at module level, before any fixture runs — see tests/README.md.
from app.models.db_models import (  # noqa: F401
    ConfigDB,
    KioskDB,
    KeyboardMappingDB,
    PluginDB,
    PluginTypeDB,
)

from ._support.db import (
    assert_models_registered,
    assert_required_tables,
    cleanup_db_file,
    create_tables_with_verify,
    update_ormar_models_database,
    windows_settle,
)

logger = logging.getLogger(__name__)

# Fail fast in CI if model registration didn't happen.
assert_models_registered()


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def temp_db_path() -> Generator[Path, None, None]:
    """Create a temporary SQLite file with Windows-tolerant cleanup."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        db_path = Path(tmp.name)
    try:
        yield db_path
    finally:
        cleanup_db_file(db_path)


# Backward-compat alias — kept while we phase out the duplicate name.
temp_db_path_for_integration = temp_db_path


@pytest_asyncio.fixture
async def test_database(temp_db_path: Path) -> AsyncGenerator[databases.Database, None]:
    """Create a test database connection with tables already created."""
    create_tables_with_verify(temp_db_path)

    test_db_url = f"sqlite+aiosqlite:///{temp_db_path.resolve()}"
    test_db = databases.Database(test_db_url)
    await test_db.connect()

    try:
        yield test_db
    finally:
        if test_db.is_connected:
            await test_db.disconnect()
        await windows_settle()


@pytest_asyncio.fixture
async def test_db(test_database: databases.Database) -> AsyncGenerator[databases.Database, None]:
    """Patch app.database + Ormar models to point at the test database."""
    import app.database as db_module

    original_database = db_module.database
    db_module.database = test_database
    update_ormar_models_database(test_database)

    try:
        # Reload modules that captured the database reference at import time.
        # Must run AFTER patching so they re-bind to the test database.
        import importlib
        import sys

        for module_name in (
            "app.services.config_service",
            "app.services.keyboard_mapping_service",
            "app.plugins.registry",
            "app.plugins.registry.loader",
            "app.plugins.registry.manager",
        ):
            if module_name in sys.modules:
                importlib.reload(sys.modules[module_name])

        yield test_database
    finally:
        update_ormar_models_database(original_database)
        db_module.database = original_database


def _reload_modules(*module_names: str) -> None:
    """Reload listed modules if already imported. Used to re-bind cached database refs."""
    import importlib
    import sys

    for name in module_names:
        if name in sys.modules:
            importlib.reload(sys.modules[name])


async def _seed_test_data(test_database: databases.Database) -> None:
    """Insert minimal plugin types, plugin instance, and config entries used by tests."""
    from datetime import datetime

    import ormar

    import app.database as db_module

    original_db = db_module.database
    db_module.database = test_database
    update_ormar_models_database(test_database)

    try:

        async def get_or_create_plugin_type(
            type_id, plugin_type, name, description, version="1.0.0", enabled=True
        ):
            try:
                return await PluginTypeDB.objects.get(type_id=type_id)
            except ormar.NoMatch:
                return await PluginTypeDB.objects.create(
                    type_id=type_id,
                    plugin_type=plugin_type,
                    name=name,
                    description=description,
                    version=version,
                    enabled=enabled,
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow(),
                )

        await get_or_create_plugin_type(
            type_id="local",
            plugin_type="image",
            name="Local Images",
            description="Load images from local directory",
        )
        await get_or_create_plugin_type(
            type_id="ical",
            plugin_type="calendar",
            name="iCal",
            description="Load calendar from iCal URL",
        )
        await get_or_create_plugin_type(
            type_id="google",
            plugin_type="calendar",
            name="Google Calendar",
            description="Load calendar from Google Calendar API",
        )
        await get_or_create_plugin_type(
            type_id="weather",
            plugin_type="service",
            name="Weather",
            description="Weather service plugin",
        )
        await get_or_create_plugin_type(
            type_id="iframe",
            plugin_type="service",
            name="iFrame",
            description="iFrame service plugin",
        )

        try:
            await PluginDB.objects.get(id="local-images")
        except ormar.NoMatch:
            await PluginDB.objects.create(
                id="local-images",
                type_id="local",
                plugin_type="image",
                name="Local Images",
                enabled=True,
                display_order=0,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )

        async def get_or_create_config(key, value, value_type):
            try:
                return await ConfigDB.objects.get(key=key)
            except ormar.NoMatch:
                return await ConfigDB.objects.create(key=key, value=value, value_type=value_type)

        await get_or_create_config(key="show_ui", value="true", value_type="bool")
        await get_or_create_config(key="theme", value="default", value_type="string")
    finally:
        db_module.database = original_db
        update_ormar_models_database(original_db)


@pytest.fixture
def test_client(temp_db_path: Path, temp_image_dir: Path) -> Generator[TestClient, None, None]:
    """Create a TestClient bound to a fresh SQLite file with seeded test data."""
    import os

    import app.config

    original_image_dir = os.environ.get("IMAGE_DIR")
    os.environ["IMAGE_DIR"] = str(temp_image_dir.resolve())

    original_db_url = app.config.settings.database_url
    test_db_path_abs = temp_db_path.resolve()
    app.config.settings.database_url = f"sqlite:///{test_db_path_abs}"

    create_tables_with_verify(temp_db_path)

    test_db_url = f"sqlite+aiosqlite:///{test_db_path_abs}"
    test_database = databases.Database(test_db_url)

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(test_database.connect())
    finally:
        loop.close()

    import app.database as db_module

    original_database = db_module.database
    db_module.database = test_database
    update_ormar_models_database(test_database)

    # Reload services + routes AFTER patching so they bind to the test database.
    _reload_modules(
        "app.services.config_service",
        "app.services.keyboard_mapping_service",
        "app.services.plugin_calendar_service",
        "app.services.plugin_image_service",
        "app.plugins.registry",
        "app.plugins.registry.loader",
        "app.plugins.registry.manager",
        "app.api.routes.plugins",
        "app.api.routes.plugins.management",
        "app.api.routes.plugins.instances",
        "app.api.routes.plugins.themes",
        "app.api.routes.config",
        "app.api.routes.calendar",
        "app.api.routes.images",
        "app.api.routes.keyboard",
        "app.api.routes.system",
        "app.api.routes.web_services",
    )

    loop_data = asyncio.new_event_loop()
    asyncio.set_event_loop(loop_data)
    try:
        loop_data.run_until_complete(_seed_test_data(test_database))
    finally:
        loop_data.close()

    # Seed default keyboard mappings (mirrors production lifespan behaviour).
    loop_kbd = asyncio.new_event_loop()
    asyncio.set_event_loop(loop_kbd)
    try:
        from app.main import _initialize_keyboard_mappings

        loop_kbd.run_until_complete(_initialize_keyboard_mappings())
    finally:
        loop_kbd.close()

    # Load plugins into manager and register their instances from DB.
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        from app.plugins.loader import plugin_loader
        from app.plugins.registry.loader import load_plugin_instances

        plugin_loader.load_all_plugins()
        loop.run_until_complete(load_plugin_instances())
    finally:
        loop.close()

    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware

    from app.api.routes import (
        calendar,
        config,
        health,
        images,
        keyboard,
        plugins,
        system,
    )

    test_app = FastAPI(title="Calvin Test API")
    test_app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    test_app.include_router(health.router, prefix="/api", tags=["health"])
    test_app.include_router(config.router, prefix="/api", tags=["config"])
    test_app.include_router(calendar.router, prefix="/api", tags=["calendar"])
    test_app.include_router(keyboard.router, prefix="/api", tags=["keyboard"])
    test_app.include_router(images.router, prefix="/api", tags=["images"])
    test_app.include_router(plugins.router, prefix="/api", tags=["plugins"])
    test_app.include_router(system.router, prefix="/api/system", tags=["system"])

    @test_app.get("/")
    async def root():
        return {"message": "Calvin Dashboard API", "version": "0.1.0"}

    # Final ready-check before yielding (with retry to absorb FS flush latency).
    assert_required_tables(test_db_path_abs, retries=5)

    with TestClient(test_app) as client:
        yield client

    # Cleanup: unregister plugins so the singleton plugin_manager doesn't
    # leak references to a database we're about to disconnect.
    from app.plugins.manager import plugin_manager

    for plugin_id in list(plugin_manager._plugins.keys()):
        try:
            plugin = plugin_manager.get_plugin(plugin_id)
            if plugin:
                cleanup_loop = asyncio.new_event_loop()
                asyncio.set_event_loop(cleanup_loop)
                try:

                    async def _cleanup():
                        try:
                            await plugin.cleanup()
                        except Exception:
                            pass

                    cleanup_loop.run_until_complete(_cleanup())
                finally:
                    cleanup_loop.close()

            unregister_loop = asyncio.new_event_loop()
            asyncio.set_event_loop(unregister_loop)
            try:

                async def _unregister():
                    try:
                        await plugin_manager.unregister(plugin_id)
                    except Exception:
                        pass

                unregister_loop.run_until_complete(_unregister())
            finally:
                unregister_loop.close()
        except Exception:
            pass

    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(test_database.disconnect())
        finally:
            loop.close()
    except Exception:
        pass

    app.config.settings.database_url = original_db_url
    db_module.database = original_database
    update_ormar_models_database(original_database)

    if original_image_dir is None:
        os.environ.pop("IMAGE_DIR", None)
    else:
        os.environ["IMAGE_DIR"] = original_image_dir


@pytest.fixture
def temp_image_dir() -> Generator[Path, None, None]:
    """Create a temporary directory for test images."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)


@pytest.fixture
def mock_env_vars(monkeypatch, temp_db_path: Path, temp_image_dir: Path):
    """Mock environment variables for testing."""
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{temp_db_path}")
    monkeypatch.setenv("IMAGE_DIR", str(temp_image_dir))
    monkeypatch.setenv("LOG_LEVEL", "INFO")


@pytest.fixture
def temp_plugins_dir(tmp_path):
    """Create a temporary plugins directory."""
    plugins_dir = tmp_path / "plugins"
    plugins_dir.mkdir()
    return plugins_dir


@pytest.fixture
def temp_themes_dir(tmp_path):
    """Create a temporary themes directory."""
    themes_dir = tmp_path / "themes"
    themes_dir.mkdir(parents=True)
    return themes_dir


@pytest.fixture(autouse=True)
def patch_data_directories(monkeypatch, tmp_path, temp_plugins_dir, temp_themes_dir):
    """Patch plugin/theme installers to write under tmp_path so tests don't touch real data."""
    from app.services.plugin_installer import plugin_installer
    from app.services.theme_installer import theme_installer

    original_plugins_dir = plugin_installer.plugins_dir
    original_themes_dir = theme_installer.themes_dir

    plugin_installer.plugins_dir = temp_plugins_dir
    theme_installer.themes_dir = temp_themes_dir

    yield

    plugin_installer.plugins_dir = original_plugins_dir
    theme_installer.themes_dir = original_themes_dir
