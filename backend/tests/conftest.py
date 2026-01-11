"""Pytest configuration and shared fixtures."""

import asyncio
import logging
import tempfile
import time
from collections.abc import AsyncGenerator, Generator
from pathlib import Path

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models.db_models import (  # noqa: F401
    ConfigDB,
    KeyboardMappingDB,
    PluginDB,
    PluginTypeDB,
)

logger = logging.getLogger(__name__)

# Import all models to ensure they're registered in Base.metadata
# This must be done at module level, before any fixtures run


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

    # Removed base_test_db fixture - we now use Base.metadata.create_all() for each test
    # This is simpler and provides better isolation


@pytest.fixture
def temp_db_path() -> Generator[Path, None, None]:
    """
    Create a temporary database file for testing.

    For integration tests (test_client), this will be overridden to use base_test_db.
    For unit tests (test_engine), this creates a fresh empty database.
    """
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        db_path = Path(tmp.name)
    yield db_path
    # Cleanup
    if db_path.exists():
        db_path.unlink()


@pytest.fixture
def temp_db_path_for_integration() -> Generator[Path, None, None]:
    """
    Create a fresh temporary database file for each integration test.

    Each test gets a fresh database with migrations run - perfect isolation.
    This is simpler than copying a base database and avoids connection issues.
    """
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        db_path = Path(tmp.name)
    yield db_path
    # Cleanup
    if db_path.exists():
        db_path.unlink()


@pytest_asyncio.fixture
async def test_engine(temp_db_path: Path) -> AsyncGenerator[AsyncEngine, None]:
    """Create a test database engine."""
    test_db_url = f"sqlite+aiosqlite:///{temp_db_path}"
    engine = create_async_engine(test_db_url, echo=False)

    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    # Cleanup
    await engine.dispose()


@pytest_asyncio.fixture
async def test_db(test_engine: AsyncEngine) -> AsyncGenerator[AsyncSession, None]:
    """Create a test database session."""
    # Patch AsyncSessionLocal for unit tests so plugin_registry uses the test database
    import app.database as db_module

    original_session_factory = db_module.AsyncSessionLocal

    # Create session factory for this test database
    # Use the same factory so all sessions share the same engine/connection pool
    async_session_factory = sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)
    db_module.AsyncSessionLocal = async_session_factory

    try:
        # Also reload plugin_registry modules so they use the patched AsyncSessionLocal
        # This ensures plugin_registry operations use the test database
        # Note: We don't restore plugin_registry here because integration tests
        # (using test_client) will reload it with their own database setup
        import importlib
        import sys

        # Reload all registry modules that use AsyncSessionLocal
        registry_modules = [
            "app.plugins.registry",
            "app.plugins.registry.loader",  # Must reload to use patched AsyncSessionLocal
            "app.plugins.registry.manager",  # Must reload to use patched AsyncSessionLocal
        ]
        for module_name in registry_modules:
            if module_name in sys.modules:
                importlib.reload(sys.modules[module_name])

        async_session = sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)
        async with async_session() as session:
            yield session
    finally:
        # Restore original session factory
        # Don't reload plugin_registry here - let test_client handle it for integration tests
        db_module.AsyncSessionLocal = original_session_factory


@pytest.fixture
def test_client(
    temp_db_path_for_integration: Path, temp_image_dir: Path
) -> Generator[TestClient, None, None]:
    """
    Create a test client for FastAPI.

    Based on https://notes.kodekloud.com/docs/Python-API-Development-with-FastAPI/Testing/Create-Destroy-Database-After-Each-Test
    Uses Base.metadata.create_all() instead of migrations for simplicity and speed.
    """
    import asyncio
    import os

    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

    import app.config
    from app.database import Base

    # Set IMAGE_DIR environment variable before plugins are loaded
    original_image_dir = os.environ.get("IMAGE_DIR")
    os.environ["IMAGE_DIR"] = str(temp_image_dir.resolve())

    original_db_url = app.config.settings.database_url
    # Use absolute path to avoid path resolution issues
    test_db_path_abs = temp_db_path_for_integration.resolve()
    app.config.settings.database_url = f"sqlite:///{test_db_path_abs}"

    # Create engine for fresh test database
    test_db_url = f"sqlite+aiosqlite:///{test_db_path_abs}"
    test_engine = create_async_engine(test_db_url, echo=False, future=True)
    test_session_factory = async_sessionmaker(
        test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    # Setup: Create all tables using Base.metadata.create_all()
    # This is simpler and faster than running migrations for tests
    # All tables are defined in models, so this is sufficient
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:

        async def create_tables():
            async with test_engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)

        loop.run_until_complete(create_tables())
    finally:
        loop.close()

    # Patch the database module to use our test engine
    # IMPORTANT: Do this BEFORE importing any routes,
    # as they import AsyncSessionLocal at module level
    import app.database as db_module

    original_engine = db_module.engine
    original_session_factory = db_module.AsyncSessionLocal

    db_module.engine = test_engine
    db_module.AsyncSessionLocal = test_session_factory

    # CRITICAL: Reload modules AFTER patching database, not before
    # This ensures all modules use the NEW patched AsyncSessionLocal
    # If we reload before patching, modules will import the OLD AsyncSessionLocal
    import importlib
    import sys

    # Reload plugin_registry modules so they use the patched AsyncSessionLocal
    registry_modules = [
        "app.plugins.registry",
        "app.plugins.registry.loader",  # Must reload loader to use patched AsyncSessionLocal
        "app.plugins.registry.manager",  # Must reload manager to use patched AsyncSessionLocal
    ]
    for module_name in registry_modules:
        if module_name in sys.modules:
            importlib.reload(sys.modules[module_name])

    # Reload routes modules that use AsyncSessionLocal
    # IMPORTANT: Must reload AFTER patching database so they get the new session
    routes_modules = [
        "app.api.routes.plugins",
        "app.api.routes.plugins.management",  # Uses AsyncSessionLocal at line 420
        "app.api.routes.plugins.instances",  # Uses AsyncSessionLocal for plugin instances
        "app.api.routes.plugins.themes",  # Must reload themes to use patched AsyncSessionLocal
        "app.api.routes.config",
        "app.api.routes.calendar",
        "app.api.routes.images",
        "app.api.routes.keyboard",
        "app.api.routes.system",
        "app.api.routes.web_services",
    ]
    for module_name in routes_modules:
        if module_name in sys.modules:
            importlib.reload(sys.modules[module_name])

    # Add test data to the fresh database
    # (tables already created via Base.metadata.create_all above)
    import logging

    logger = logging.getLogger(__name__)

    # Add test data
    loop_data = asyncio.new_event_loop()
    asyncio.set_event_loop(loop_data)
    try:

        async def add_test_data():
            async with test_session_factory() as session:
                from datetime import datetime

                # Add plugin types
                plugin_types = [
                    PluginTypeDB(
                        type_id="local",
                        plugin_type="image",
                        name="Local Images",
                        description="Load images from local directory",
                        version="1.0.0",
                        enabled=True,
                        created_at=datetime.utcnow(),
                        updated_at=datetime.utcnow(),
                    ),
                    PluginTypeDB(
                        type_id="ical",
                        plugin_type="calendar",
                        name="iCal",
                        description="Load calendar from iCal URL",
                        version="1.0.0",
                        enabled=True,
                        created_at=datetime.utcnow(),
                        updated_at=datetime.utcnow(),
                    ),
                    PluginTypeDB(
                        type_id="google",
                        plugin_type="calendar",
                        name="Google Calendar",
                        description="Load calendar from Google Calendar API",
                        version="1.0.0",
                        enabled=True,
                        created_at=datetime.utcnow(),
                        updated_at=datetime.utcnow(),
                    ),
                    PluginTypeDB(
                        type_id="weather",
                        plugin_type="service",
                        name="Weather",
                        description="Weather service plugin",
                        version="1.0.0",
                        enabled=True,
                        created_at=datetime.utcnow(),
                        updated_at=datetime.utcnow(),
                    ),
                    PluginTypeDB(
                        type_id="iframe",
                        plugin_type="service",
                        name="iFrame",
                        description="iFrame service plugin",
                        version="1.0.0",
                        enabled=True,
                        created_at=datetime.utcnow(),
                        updated_at=datetime.utcnow(),
                    ),
                ]

                for plugin_type in plugin_types:
                    session.add(plugin_type)

                # Add some default plugins
                plugins = [
                    PluginDB(
                        id="local-images",
                        type_id="local",
                        plugin_type="image",
                        name="Local Images",
                        enabled=True,
                        display_order=0,
                        created_at=datetime.utcnow(),
                        updated_at=datetime.utcnow(),
                    ),
                ]

                for plugin in plugins:
                    session.add(plugin)

                # Add some default config entries
                config_entries = [
                    ConfigDB(key="show_ui", value="true", value_type="bool"),
                    ConfigDB(key="theme", value="default", value_type="string"),
                ]

                for config_entry in config_entries:
                    session.add(config_entry)

                # Add built-in themes to test database (same as migrations would do)
                # Themes are plugin types with plugin_type='theme'
                from app.api.routes.plugins.themes import BUILTIN_THEMES
                from app.plugins.base import PluginType

                for theme_id, theme_data in BUILTIN_THEMES.items():
                    theme_type = PluginTypeDB(
                        type_id=theme_id,
                        plugin_type=PluginType.THEME.value,
                        name=theme_data.get("name", theme_id),
                        description=theme_data.get("description", ""),
                        version=theme_data.get("version", "1.0.0"),
                        enabled=True,
                        created_at=datetime.utcnow(),
                        updated_at=datetime.utcnow(),
                    )
                    session.add(theme_type)

                await session.commit()
                logger.debug("Added test data (including themes) to test database")

        loop_data.run_until_complete(add_test_data())
    finally:
        loop_data.close()

    # Verify database has tables
    import sqlite3

    try:
        conn = sqlite3.connect(str(test_db_path_abs))
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = {row[0] for row in cursor.fetchall()}
        conn.close()
        logger.debug(f"Database {test_db_path_abs} has tables: {sorted(tables)}")
        required = {"plugins", "plugin_types", "config", "keyboard_mappings"}
        if not (required <= tables):
            missing = required - tables
            raise RuntimeError(
                f"Database {test_db_path_abs} missing tables: {missing}. "
                f"Existing tables: {sorted(tables)}"
            )
    except Exception as e:
        logger.error(f"Failed to verify database: {e}")
        raise

    # Load plugins and sync plugin types/themes (but don't run migrations)
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        # Load plugins so they're available for tests
        from app.plugins.loader import plugin_loader

        plugin_loader.load_all_plugins()

        # Plugin types are already in the base database, so we don't need to load them
        # Calling load_plugin_types() can cause issues because:
        # 1. It tries to load ALL plugin types from plugin_loader, including ones that might fail
        # 2. When a plugin type fails, it tries to update the database, which can cause
        #    "no such table" errors if the session is using the wrong database connection
        # 3. The base database already has all the plugin types we need for tests
        #
        # If we need to update plugin types, we should do it explicitly in tests, not here
        from app.plugins.registry.loader import load_plugin_instances

        # Load plugin instances from database and register them in plugin manager
        # This is critical - without this, plugin instances exist in DB but aren't
        # registered in the plugin manager, causing "plugin not found" errors
        #
        # IMPORTANT: Verify the session is using the correct database before loading
        # The loader module was reloaded above, so it should use the patched AsyncSessionLocal
        try:
            # Quick verification that AsyncSessionLocal is using the test database
            async def verify_session_db():
                async with db_module.AsyncSessionLocal() as session:
                    # Try a simple query to verify the database has tables
                    from sqlalchemy import text

                    result = await session.execute(
                        text(
                            "SELECT name FROM sqlite_master "
                            "WHERE type='table' AND name='plugin_types'"
                        )
                    )
                    row = result.fetchone()
                    if not row:
                        raise RuntimeError(
                            f"Session is not using the correct database! "
                            f"Expected plugin_types table in {test_db_path_abs}"
                        )

            loop.run_until_complete(verify_session_db())
        except Exception as e:
            logger.error(f"Session verification failed before load_plugin_instances(): {e}")
            raise

        loop.run_until_complete(load_plugin_instances())

        # Themes are already in the base database, so we don't need to sync them
        # This avoids the "no such table" errors from sync_themes_to_db() using
        # the wrong AsyncSessionLocal reference
    finally:
        loop.close()

    # Tables are already created and verified above, no need to double-check

    # Create a test app without the complex lifespan
    # This avoids startup issues in tests
    # Note: plugin_registry and routes were already reloaded above (before database init)
    # so they're already using the patched AsyncSessionLocal

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
    test_app.include_router(system.router, prefix="/api", tags=["system"])

    @test_app.get("/")
    async def root():
        """Root endpoint."""
        return {"message": "Calvin Dashboard API", "version": "0.1.0"}

    # Verify database is ready before yielding client
    # This ensures tables exist before any test runs
    import sqlite3

    max_retries = 5
    for attempt in range(max_retries):
        try:
            conn = sqlite3.connect(str(test_db_path_abs))
            cursor = conn.cursor()
            cursor.execute(
                "SELECT name FROM sqlite_master WHERE type='table' "
                "AND name IN ('plugins', 'plugin_types', 'config', 'keyboard_mappings')"
            )
            tables = {row[0] for row in cursor.fetchall()}
            conn.close()

            required_tables = {"plugins", "plugin_types", "config", "keyboard_mappings"}
            if tables >= required_tables:
                break
            elif attempt < max_retries - 1:
                time.sleep(0.2 * (attempt + 1))  # Exponential backoff
            else:
                missing = required_tables - tables
                raise RuntimeError(
                    f"Database tables not ready after {max_retries} attempts. "
                    f"Missing: {missing}. Database: {test_db_path_abs}"
                )
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(0.2 * (attempt + 1))
            else:
                raise RuntimeError(
                    f"Failed to verify database tables: {e}. Database: {test_db_path_abs}"
                ) from e

    with TestClient(test_app) as client:
        yield client

    # Cleanup: Clear plugin manager state before disposing engine
    # plugin_manager is a singleton and retains state between tests
    # We need to unregister all plugins to avoid them pointing to the wrong database
    from app.plugins.manager import plugin_manager

    # Get list of plugin IDs before unregistering (can't modify dict while iterating)
    plugin_ids = list(plugin_manager._plugins.keys())
    for plugin_id in plugin_ids:
        try:
            plugin = plugin_manager.get_plugin(plugin_id)
            if plugin:
                # Cleanup plugin before unregistering
                loop_cleanup = asyncio.new_event_loop()
                asyncio.set_event_loop(loop_cleanup)
                try:

                    async def cleanup_plugin():
                        try:
                            await plugin.cleanup()
                        except Exception:
                            pass  # Ignore cleanup errors

                    loop_cleanup.run_until_complete(cleanup_plugin())
                finally:
                    loop_cleanup.close()

            # Unregister plugin
            async def unregister_plugin():
                try:
                    await plugin_manager.unregister(plugin_id)
                except Exception:
                    pass  # Ignore unregister errors

            loop_unregister = asyncio.new_event_loop()
            asyncio.set_event_loop(loop_unregister)
            try:
                loop_unregister.run_until_complete(unregister_plugin())
            finally:
                loop_unregister.close()
        except Exception:
            pass  # Ignore errors during cleanup

    # Cleanup: dispose test engine and restore original database
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(test_engine.dispose())
        finally:
            loop.close()
    except Exception:
        pass

    # Restore original database URL and engine
    app.config.settings.database_url = original_db_url
    db_module.engine = original_engine
    db_module.AsyncSessionLocal = original_session_factory

    # Restore original IMAGE_DIR environment variable
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
def temp_frontend_dir(tmp_path):
    """Create a temporary frontend directory."""
    frontend_dir = tmp_path / "frontend" / "src" / "components" / "plugins"
    frontend_dir.mkdir(parents=True)
    return frontend_dir


@pytest.fixture
def temp_themes_dir(tmp_path):
    """Create a temporary themes directory."""
    themes_dir = tmp_path / "themes"
    themes_dir.mkdir(parents=True)
    return themes_dir


@pytest.fixture(autouse=True)
def patch_data_directories(
    monkeypatch, tmp_path, temp_plugins_dir, temp_frontend_dir, temp_themes_dir
):
    """
    Automatically patch plugin and theme installers to use temporary directories.
    This ensures tests don't affect real application data.
    """
    # Patch plugin installer
    from app.services.plugin_installer import plugin_installer

    original_plugins_dir = plugin_installer.plugins_dir
    original_frontend_dir = plugin_installer.frontend_plugins_dir

    plugin_installer.plugins_dir = temp_plugins_dir
    plugin_installer.frontend_plugins_dir = temp_frontend_dir

    # Patch theme installer
    from app.services.theme_installer import theme_installer

    original_themes_dir = theme_installer.themes_dir

    theme_installer.themes_dir = temp_themes_dir

    yield

    # Restore original directories
    plugin_installer.plugins_dir = original_plugins_dir
    plugin_installer.frontend_plugins_dir = original_frontend_dir
    theme_installer.themes_dir = original_themes_dir
